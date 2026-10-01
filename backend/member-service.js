import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const phoneDigits = (value) => String(value ?? '').replace(/[\s()+.-]/g, '');
function text(form, field, max, required = true) {
  const raw = form.get(field);
  if (raw !== null && typeof raw !== 'string') throw new ApiError(400, `Invalid ${field}.`);
  const value = (raw ?? '').trim();
  if ((required && !value) || value.length > max) throw new ApiError(400, `Please check ${field}.`);
  return value;
}
function phone(form) {
  const value = phoneDigits(text(form, 'phone', 64));
  if (!/^\d{7,15}$/.test(value)) throw new ApiError(400, 'Enter a phone number with country code.');
  return value;
}
function email(form) {
  const value = text(form, 'email', 320, false);
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ApiError(400, 'Please check email.');
  return value || null;
}

function otpPhone(form) {
  const value = phone(form);
  // This gym accepts Malaysian mobile numbers in local or international form.
  if (/^01\d{8,9}$/.test(value)) return `6${value}`;
  if (value.startsWith('0')) throw new ApiError(400, 'Enter your WhatsApp number with country code, for example 60167619166.');
  return value;
}

export function attendanceDays(events, now = new Date()) {
  const dayKey = (date) => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const today = dayKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - (6 - index) * 86400000).toISOString().slice(0, 10);
    const rows = events.filter((event) => dayKey(event.occurredAt) === date);
    const entries = rows.filter((event) => event.direction === 'ENTRY').map((e) => new Date(e.occurredAt).getTime());
    const exits = rows.filter((event) => event.direction === 'EXIT').map((e) => new Date(e.occurredAt).getTime());
    const first = entries.length ? Math.min(...entries) : null;
    const last = exits.length ? Math.max(...exits) : null;
    const complete = first !== null && last !== null && last >= first;
    return { date, firstEntry: first === null ? null : new Date(first).toISOString(),
      lastExit: last === null ? null : new Date(last).toISOString(),
      durationMinutes: complete ? Math.floor((last - first) / 60000) : 0,
      status: complete ? 'complete' : rows.length ? 'incomplete' : 'none' };
  });
}

export class MemberService {
  constructor(repository, uploadDirectory, { sendOtp } = {}) {
  this.repo = repository;
  this.uploadDirectory = uploadDirectory;
  this.attempts = new Map();
  this.otpStore = new Map();
  this.registrationTokens = new Map();
  this.sendOtp = sendOtp;
}

  limit(key, maximum, interval) {
    const now = Date.now();
    for (const [entry, value] of this.attempts) if (value.expires <= now) this.attempts.delete(entry);
    const value = this.attempts.get(key) ?? { count: 0, expires: now + interval };
    if (++value.count > maximum) throw new ApiError(429, 'Too many attempts. Please try again later.');
    this.attempts.set(key, value);
  }

  async identity(token) {
    if (!/^web_[a-f0-9]{64}$/.test(token ?? '')) throw new ApiError(401, 'Please sign in again.');
    const session = await this.repo.session(hash(token));
    if (!session) throw new ApiError(401, 'Please sign in again.');
    let staffId = session.staffId;
    let application;
    if (session.requestId) {
      application = await this.repo.application(session.requestId);
      if (!application) throw new ApiError(401, 'Please sign in again.');
      if (application.status === 'APPROVED') staffId = application.staffId;
    }
    const staff = staffId ? await this.repo.staff(staffId) : null;
    if (staffId && !staff) throw new ApiError(401, 'Please sign in again.');
    if (!staff && !application) throw new ApiError(401, 'Please sign in again.');
    return { staff, application, requestId: session.requestId, staffId: staff?.id ?? null };
  }

  async get(view, token) {
    if (view === 'plans') return { plans: await this.repo.plans() };
   if (view === 'registration-options') return {
  plans: await this.repo.plans(),
  registrationFeeCents: 6000,
  paymentInstructions: (await this.repo.settings()).paymentInstructions ?? '',
};
    const identity = await this.identity(token);
    const { staff, application, staffId, requestId } = identity;

    if (view === 'plans') {
    return await this.repo.membershipPlans();
}

    if (view === 'me') {
      const person = staff ?? application;
      return { name: person.name, phone: person.phone, email: person.email,
        memberId: staff?.memberId ?? application.id, approved: Boolean(staff),
        registrationStatus: staff ? 'APPROVED' : application.status,
       birthDate: staff?.birthDate ?? null,
        photoKey: person.photoKey ?? null,
        memberPhotoKey: staff?.memberPhotoKey ?? null,
        pushEnabled: Boolean(staff?.pushEnabled ?? true),
        deviceSync: 'UNKNOWN', membership: staff ? await this.repo.membership(staffId) : null,
        requests: await this.repo.requests(staffId, requestId) };
    }
    if (view === 'settings') return this.repo.settings();
    if (view === 'attendance') return { days: staff ? attendanceDays(await this.repo.events(staffId)) : [] };
    if (view === 'photo') {
      const key = (staff ?? application).photoKey;
      if (!key) throw new ApiError(404, 'Photo unavailable.');
      if (!/^web\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key)) {
        const photo = await this.repo.mediaPhoto(key);
        const bytes = photo?.bytes;
        if (!Buffer.isBuffer(bytes) || !bytes.length) throw new ApiError(404, 'Photo unavailable.');
        // Identify supported raster formats from bytes, rather than trusting stored MIME metadata.
        let contentType;
        if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) contentType = 'image/png';
        else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) contentType = 'image/jpeg';
        else if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') contentType = 'image/webp';
        else throw new ApiError(404, 'Photo format is not supported.');
        return { bytes, contentType };
      }
      try {
        return { bytes: await readFile(join(this.uploadDirectory, key.slice(4))),
          contentType: key.endsWith('.jpg') ? 'image/jpeg' : key.endsWith('.png') ? 'image/png' : 'image/webp' };
      } catch (error) {
        if (error.code === 'ENOENT') throw new ApiError(404, 'Photo unavailable.');
        throw error;
      }
    }
    throw new ApiError(400, 'Unknown view.');
  }

  async preparePhoto(file, required = true, label = 'Photo') {
    if (!file) {
      if (required) throw new ApiError(400, `${label} image is required.`);
      return null;
    }
    if (typeof file === 'string' || !file.size || file.size > 5 * 1024 * 1024) {
      throw new ApiError(400, 'Choose an image smaller than 5 MB.');
    }
    const data = Buffer.from(await file.arrayBuffer());
    let extension;
    if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) extension = 'png';
    else if (data[0] === 255 && data[1] === 216 && data[2] === 255) extension = 'jpg';
    else if (data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP') extension = 'webp';
    else throw new ApiError(400, 'Choose a PNG, JPEG or WebP image.');
    return { storageKey: `${randomUUID()}.${extension}`, bytes: data,
      contentType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}` };
  }

  async saveImage(file, required = true) {
    const image = await this.preparePhoto(file, required, 'Receipt');
    if (!image) return null;
    await mkdir(this.uploadDirectory, { recursive: true });
    await writeFile(join(this.uploadDirectory, image.storageKey), image.bytes, { flag: 'wx' });
    return `web/${image.storageKey}`;
  }

  async removeImages(keys) {
    await Promise.all(keys.filter(Boolean).map((key) => unlink(join(this.uploadDirectory, key.slice(4))).catch(() => {})));
  }

  async post(form, token, address) {
    const action = text(form, 'action', 40);

if (action === 'request-otp') {
  this.limit(`otp-ip:${address}`, 10, 15 * 60000);

  const number = otpPhone(form);
  this.limit(`otp-phone:${hash(number)}`, 1, 60000);
  this.limit(`otp-phone-hour:${hash(number)}`, 5, 3600000);
  const purpose = text(form, 'purpose', 20, false);

if (purpose === 'login') {

  const staff = await this.repo.staffByPhone(number);

  if (!staff) {
    throw new ApiError(401, 'This WhatsApp number is not registered.');
  }

} else {

  if (await this.repo.registrationExists(number)) {
    throw new ApiError(
      409,
      'This number already has an account or registration. Please sign in or contact the gym.'
    );
  }

}

  if (!this.sendOtp) throw new ApiError(503, 'WhatsApp delivery is not configured. Please contact the gym.');
  for (const [key, record] of this.otpStore) {
    if (record.expiresAt <= Date.now()) this.otpStore.delete(key);
  }
  const otp = String(randomInt(100000, 1000000));
  const record = {
    otpHash: hash(otp),
    expiresAt: Date.now() + 5 * 60000,
    attempts: 0,
    ready: false,
  };
  this.otpStore.set(number, record);
  try {
    await this.sendOtp(number, otp);
    record.ready = true;
  } catch (_) {
    if (this.otpStore.get(number) === record) this.otpStore.delete(number);
    throw new ApiError(502, 'Unable to send your WhatsApp code. Please wait a minute and try again.');
  }

  return {
    ok: true,
    message: 'OTP queued for WhatsApp delivery.'
  };
}

if (action === 'verify-otp') {
  this.limit(`otp-verify-ip:${address}`, 10, 15 * 60000);

  const number = otpPhone(form);
  const otp = text(form, 'otp', 6);

  const record = this.otpStore.get(number);

  if (!record || !record.ready) {
    throw new ApiError(401, 'OTP not found. Please request a new OTP.');
  }

  if (Date.now() > record.expiresAt) {
    this.otpStore.delete(number);
    throw new ApiError(401, 'OTP has expired. Please request a new OTP.');
  }

  if (++record.attempts > 5) {
    this.otpStore.delete(number);
    throw new ApiError(429, 'Too many incorrect codes. Please request a new OTP.');
  }
  if (!timingSafeEqual(Buffer.from(record.otpHash), Buffer.from(hash(otp)))) {
    if (record.attempts === 5) this.otpStore.delete(number);
    throw new ApiError(401, 'Incorrect OTP.');
  }

  // Consume before asynchronous work so concurrent requests cannot reuse a code.
  this.otpStore.delete(number);
  for (const [key, value] of this.registrationTokens) {
    if (value.expiresAt <= Date.now()) this.registrationTokens.delete(key);
  }
  const registrationToken = randomBytes(32).toString('hex');
  this.registrationTokens.set(hash(registrationToken), { phone: number, expiresAt: Date.now() + 15 * 60000 });
  return { registrationToken };
}

    if (action === 'login') {
      this.limit(`login-ip:${address}`, 30, 15 * 60000);
      const id = text(form, 'memberId', 128, false);
      if (!id) {
        const number = otpPhone(form);
        this.limit(`login-phone:${hash(number)}`, 10, 15 * 60000);
        const staff = await this.repo.staffByPhone(number);
        const application = staff ? null : await this.repo.applicationByPhone(number);
        if (!staff && !application) throw new ApiError(401, 'No active member or pending registration found. New members, please register first.');
        const sessionToken = `web_${randomBytes(32).toString('hex')}`;
        await this.repo.createSession(hash(sessionToken), staff?.id ?? null, application?.id ?? null);
        return { token: sessionToken };
      }
      this.limit(`login-id:${hash(id.toLowerCase())}`, 10, 15 * 60000);
      const number = phone(form);
      const staff = await this.repo.staff(id, true);
      const application = staff ? null : await this.repo.application(id);
      const person = staff ?? application;
      if (!person || !timingSafeEqual(Buffer.from(hash(phoneDigits(person.phone))), Buffer.from(hash(number)))) {
        throw new ApiError(401, 'Member ID or phone number is incorrect.');
      }
      const sessionToken = `web_${randomBytes(32).toString('hex')}`;
      await this.repo.createSession(hash(sessionToken), staff?.id ?? null, application?.id ?? null);
      return { token: sessionToken };
    }
    if (action === 'logout') {
      if (/^web_[a-f0-9]{64}$/.test(token ?? '')) await this.repo.logout(hash(token));
      return { ok: true };
    }
    if (action === 'register' || action === 'renew') {
      this.limit(`application:${address}`, 10, 3600000);
      const identity = action === 'renew' ? await this.identity(token) : null;
      if (identity && !identity.staff) throw new ApiError(403, 'Registration must be approved before renewal.');
      const planId = text(form, 'planId', 128);
      if (!(await this.repo.plans()).some((p) => p.id === planId)) throw new ApiError(400, 'Please select an available plan.');
      const data = { id: randomUUID(), kind: action === 'register' ? 'REGISTER' : 'RENEW',
        staffId: identity?.staffId ?? null, planId,
        name: identity?.staff.name ?? text(form, 'fullName', 256),
        phone: identity?.staff.phone ?? otpPhone(form), email: identity ? identity.staff.email : email(form) };
      let verificationKey, verification;
      if (action === 'register') {
        verificationKey = hash(text(form, 'registrationToken', 64, false));
        verification = this.registrationTokens.get(verificationKey);
        if (!verification || verification.expiresAt <= Date.now() || verification.phone !== data.phone) {
          throw new ApiError(401, 'Verify your WhatsApp number with OTP before registering.');
        }
        // Reserve synchronously so concurrent submissions cannot reuse verification.
        this.registrationTokens.delete(verificationKey);
      }
      const images = [];
      try {
        const photo = action === 'register' ? await this.preparePhoto(form.get('photo')) : null;
        data.photoKey = photo?.storageKey ?? null;
        data.receiptKey = await this.saveImage(form.get('receipt'));
        images.push(data.receiptKey);
        const sessionToken = action === 'register' ? `web_${randomBytes(32).toString('hex')}` : null;
        await this.repo.transaction(async (repo) => {
          if (photo) await repo.savePhoto(photo);
          await repo.createRequest(data);
          if (sessionToken) await repo.createSession(hash(sessionToken), null, data.id);
        });
        return { id: data.id, ...(sessionToken ? { token: sessionToken } : {}), status: 'PENDING' };
      } catch (error) {
        await this.removeImages(images);
        if (verification && verification.expiresAt > Date.now()) this.registrationTokens.set(verificationKey, verification);
        if (error.number === 50003 || error.originalError?.info?.number === 50003) {
          throw new ApiError(409, 'This WhatsApp number already has an account or registration. Please sign in or contact the gym.');
        }
        if (error.number === 50001 || error.originalError?.info?.number === 50001) {
          throw new ApiError(400, 'This plan is no longer available. Reload the page and choose another plan.');
        }
        throw error;
      }
    }
    if (action === 'update-profile') {
      const { staffId } = await this.identity(token);
      if (!staffId) throw new ApiError(403, 'Registration must be approved first.');
      const birthDate = text(form, 'birthDate', 10, false);
      if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
        !Number.isFinite(Date.parse(birthDate)) || new Date(birthDate).toISOString().slice(0,10) !== birthDate ||
        Date.parse(birthDate) > Date.now())) throw new ApiError(400, 'Please check birth date.');
      const data = { name: text(form, 'name', 256), phone: phone(form), email: email(form), birthDate: birthDate || null };
      const photo = await this.preparePhoto(form.get('photo'), false);
      data.photoKey = photo?.storageKey ?? null;
      await this.repo.transaction(async repo => {
        if (photo) await repo.savePhoto(photo);
        await repo.updateProfile(staffId, data);
      });
      return { ok: true };
    }
    if (action === 'upload-photo') {
      const { staffId } = await this.identity(token);
      if (!staffId) throw new ApiError(403, 'Registration must be approved first.');
      this.limit(`photo:${staffId}`, 10, 3600000);
      const photo = await this.preparePhoto(form.get('photo'));
      const photoKey = photo.storageKey;
      await this.repo.transaction(async repo => {
        await repo.savePhoto(photo);
        await repo.updatePhoto(staffId, photoKey);
      });
      return { ok: true, photoKey };
    }
    throw new ApiError(400, 'Unsupported action.');
  }
}
