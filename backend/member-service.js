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
  constructor(
    repository,
    uploadDirectory,
    { sendOtp, sendSaleToTerminal, hitPayClient, otpEnabled = true } = {}
  ) {
    this.repo = repository;
    this.uploadDirectory = uploadDirectory;
    this.attempts = new Map();
    this.otpStore = new Map();
    this.registrationTokens = new Map();
    this.sendOtp = sendOtp;
    this.sendSaleToTerminal = sendSaleToTerminal;
    this.hitPayClient = hitPayClient;
    this.otpEnabled = otpEnabled;
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
    const tokenHash = hash(token);
    const session = await this.repo.session(tokenHash);
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

    if (view === 'workspaces') {
        return { workspaces: await this.repo.workspaces() };
    }
    if (view === 'workspace-for-phone') {
      const raw = phoneDigits(new URLSearchParams(token ?? '').get('phone'));
      const normalized = /^01\d{8,9}$/.test(raw) ? `6${raw}` : raw;
      if (!/^\d{7,15}$/.test(normalized)) throw new ApiError(400, 'Enter a valid phone number.');
      return { workspaces: await this.repo.workspacesByPhone(normalized) };
    }

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
    if (view === 'payments') {
      return { payments: await this.repo.paymentTransactionsForMember(staffId, requestId) };
    }
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

    if (action === 'check-payment-status') {
      if (!token) {
        throw new ApiError(401, 'Please sign in again.');
      }

      const requestId = text(form, 'requestId', 128);
      const identity = await this.identity(token);

      const paymentRequest =
        await this.repo.paymentRequest(requestId);

      if (!paymentRequest) {
        throw new ApiError(404, 'Payment request not found.');
      }

      const ownsRequest = paymentRequest.kind === 'REGISTER'
        ? identity.requestId === paymentRequest.id
        : Boolean(
            identity.staffId &&
            paymentRequest.staffId === identity.staffId
          );

      if (!ownsRequest) {
        throw new ApiError(403, 'You cannot check this payment.');
      }

      const savedPayment =
        await this.repo.paymentTransactionByRequest(requestId);

      if (!savedPayment ||
          savedPayment.paymentMethod !== 'HITPAY') {
        throw new ApiError(404, 'HitPay transaction not found.');
      }

      if (savedPayment.paymentStatus === 'PAID') {
        return {
          success: true,
          paymentStatus: 'PAID',
          invoice: savedPayment.invoiceNo,
          message: 'Payment was already confirmed.'
        };
      }

      let savedDetails = savedPayment.terminalResponse;

      if (typeof savedDetails === 'string') {
        try {
          savedDetails = JSON.parse(savedDetails);
        } catch {
          savedDetails = null;
        }
      }

      const hitPayRequestId = savedDetails?.paymentRequestId;

      if (!hitPayRequestId) {
        throw new ApiError(
          409,
          'HitPay request ID is missing. Transaction reconciliation is required.'
        );
      }

      if (!this.hitPayClient) {
        throw new ApiError(503, 'HitPay is not configured.');
      }

      const providerResult =
        await this.hitPayClient.getPaymentRequest(hitPayRequestId);

      const providerStatus =
        String(providerResult?.status ?? '').toLowerCase();

      const providerAmount = Number(providerResult?.amount);
      const expectedAmount = savedPayment.amountCents / 100;

      const amountMatches =
        Number.isFinite(providerAmount) &&
        Math.round(providerAmount * 100) === savedPayment.amountCents;

      const currencyMatches =
        String(providerResult?.currency ?? '').toUpperCase() === 'MYR';

      const referenceMatches =
        String(providerResult?.reference_number ?? '') ===
        savedPayment.invoiceNo;

      // Verify the provider's invoice reference, amount and currency.
      if (!referenceMatches || !amountMatches || !currencyMatches) {
        console.error('[HITPAY] Payment verification mismatch:', {
          invoiceNo: savedPayment.invoiceNo,
          referenceMatches,
          amountMatches,
          currencyMatches
        });

        return {
          success: false,
          invoice: savedPayment.invoiceNo,
          paymentStatus: 'UNKNOWN',
          message:
            'Payment details could not be verified. Please contact the administrator.'
        };
      }

      // Payment is still awaiting confirmation.
      if (providerStatus === 'pending') {
        return {
          success: false,
          invoice: savedPayment.invoiceNo,
          paymentStatus: 'PENDING',
          message: 'HitPay has not confirmed the payment yet.'
        };
      }

      // Payment has definitively failed, expired or been cancelled.
      if (['failed', 'expired', 'canceled', 'cancelled'].includes(providerStatus)) {
        const updatedPayment =
          await this.repo.updatePaymentTransaction({
            invoiceNo: savedPayment.invoiceNo,
            paymentStatus: 'FAILED',
            terminalResponse: {
              ...savedDetails,
              provider: 'HITPAY',
              verifiedStatus: providerStatus,
              verifiedAmount: providerResult.amount,
              verifiedCurrency: providerResult.currency,
              verifiedReference: providerResult.reference_number,
              verifiedAt: new Date().toISOString()
            }
          });

        if (!updatedPayment) {
          throw new ApiError(500, 'Unable to update the payment status.');
        }

        return {
          success: false,
          invoice: savedPayment.invoiceNo,
          requestId,
          paymentStatus: 'FAILED',
          message: `HitPay payment was ${providerStatus}. You may try again.`
        };
      }

      // Never treat an unrecognized status as a successful payment.
      if (providerStatus !== 'completed') {
        return {
          success: false,
          invoice: savedPayment.invoiceNo,
          paymentStatus: 'UNKNOWN',
          message:
            'HitPay returned an unrecognized payment status. Reconciliation is required.'
        };
      }

      const updatedPayment =
        await this.repo.updatePaymentTransaction({
          invoiceNo: savedPayment.invoiceNo,
          paymentStatus: 'PAID',
          terminalResponse: {
            ...savedDetails,
            provider: 'HITPAY',
            verifiedStatus: providerStatus,
            verifiedAmount: providerResult.amount,
            verifiedCurrency: providerResult.currency,
            verifiedAt: new Date().toISOString()
          }
        });

      if (!updatedPayment) {
        throw new ApiError(
          500,
          'Payment was confirmed but the database update failed. Reconciliation is required.'
        );
      }

      return {
        success: true,
        invoice: savedPayment.invoiceNo,
        requestId,
        paymentStatus: 'PAID',
        message: paymentRequest.kind === 'REGISTER'
          ? 'Payment confirmed. Your registration is pending admin approval.'
          : 'Payment confirmed. Review and submit your renewal to update your membership.'
      };
    }

    if (action === 'confirm-renewal') {
      if (!token) throw new ApiError(401, 'Please sign in again.');
      const requestId = text(form, 'requestId', 128);
      const identity = await this.identity(token);
      const paymentRequest = await this.repo.paymentRequest(requestId);
      if (!paymentRequest || paymentRequest.kind !== 'RENEW') throw new ApiError(404, 'Renewal request not found.');
      if (!identity.staffId || paymentRequest.staffId !== identity.staffId) throw new ApiError(403, 'You cannot confirm this renewal.');
      const payment = await this.repo.paymentTransactionByRequest(requestId);
      if (!payment || payment.paymentStatus !== 'PAID') throw new ApiError(400, 'Payment has not been verified yet.');
      const activated = await this.repo.activatePaidRenewal(requestId);
      if (!activated) {
        const latest = await this.repo.paymentRequestForHitPay(requestId);
        if (latest?.status !== 'APPROVED') throw new ApiError(409, 'This renewal has already been processed or needs reconciliation.');
      }
      return { success: true, requestId, paymentStatus: 'PAID', message: 'Renewal confirmed and membership updated.' };
    }

if (action === 'request-otp') {
  if (!this.otpEnabled) throw new ApiError(403, 'WhatsApp OTP is temporarily disabled.');
  this.limit(`otp-ip:${address}`, 10, 15 * 60000);

  const number = otpPhone(form);
  this.limit(`otp-phone:${hash(number)}`, 1, 60000);
  this.limit(`otp-phone-hour:${hash(number)}`, 5, 3600000);
  const purpose = text(form, 'purpose', 20, false);

if (purpose === 'login') {

  const staff = await this.repo.staffByPhone(number);
  const application = staff ? null : await this.repo.applicationByPhone(number);

  if (!staff && !application) {
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
  if (!this.otpEnabled) throw new ApiError(403, 'WhatsApp OTP is temporarily disabled.');
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
      const number = otpPhone(form);
      this.limit(`login-phone:${hash(number)}`, 10, 15 * 60000);
      if (this.otpEnabled) {
        const registrationToken = text(form, 'registrationToken', 64, false);
        const verificationKey = hash(registrationToken);
        const verification = this.registrationTokens.get(verificationKey);
        if (!verification || verification.expiresAt <= Date.now() || verification.phone !== number) {
          this.registrationTokens.delete(verificationKey);
          throw new ApiError(401, 'Verify your WhatsApp number before signing in.');
        }
        this.registrationTokens.delete(verificationKey);
      }
      const staff = await this.repo.staffByPhone(number);
      const application = staff ? null : await this.repo.applicationByPhone(number);
      if (!staff && !application) throw new ApiError(401, 'This WhatsApp number is not registered.');
      const sessionToken = `web_${randomBytes(32).toString('hex')}`;
      await this.repo.createSession(hash(sessionToken), staff?.id ?? null, application?.id ?? null);
      return { token: sessionToken };
    }
    if (action === 'logout') {
      if (/^web_[a-f0-9]{64}$/.test(token ?? '')) {
        const tokenHash = hash(token);
        await this.repo.logout(tokenHash);
      }
      return { ok: true };
    }
    if (action === 'register' || action === 'renew') {
      this.limit(`application:${address}`, 10, 3600000);
      const identity = action === 'renew' ? await this.identity(token) : null;
      if (identity && !identity.staff) throw new ApiError(403, 'Registration must be approved before renewal.');
      const planId = text(form, 'planId', 128);
      console.log('[Renewal debug] Workspace:', this.repo.workspace);
      console.log('[Renewal debug] Submitted planId:', planId);
      if (!(await this.repo.plans()).some((p) => p.id === planId)) throw new ApiError(400, 'Please select an available plan.');
      if (action === 'renew') {
        const existingRenewal = await this.repo.pendingRenewal(identity.staffId);
        if (existingRenewal) {
          if (existingRenewal.planId !== planId) {
            throw new ApiError(
              409,
              `A pending renewal already exists for ${existingRenewal.planName}. Resolve or cancel it before choosing another plan.`
            );
          }
          return {
            id: existingRenewal.id,
            status: existingRenewal.status,
            reused: true,
            planId: existingRenewal.planId,
            amountCents: existingRenewal.priceCents
          };
        }
      }
      const data = { id: randomUUID(), kind: action === 'register' ? 'REGISTER' : 'RENEW',
        staffId: identity?.staffId ?? null, planId,
        name: identity?.staff.name ?? text(form, 'fullName', 256),
        phone: identity?.staff.phone ?? otpPhone(form), email: identity ? identity.staff.email : email(form) };
      let verificationKey, verification;
      if (action === 'register') {
        if (this.otpEnabled) {
          verificationKey = hash(text(form, 'registrationToken', 64, false));
          verification = this.registrationTokens.get(verificationKey);
          if (!verification || verification.expiresAt <= Date.now() || verification.phone !== data.phone) {
            throw new ApiError(401, 'Verify your WhatsApp number with OTP before registering.');
          }
          this.registrationTokens.delete(verificationKey);
        }
      }
      const images = [];
      try {
        const photo = action === 'register' ? await this.preparePhoto(form.get('photo'), false) : null;
        data.photoKey = photo?.storageKey ?? null;
        const receipt = form.get('receipt');
        data.paymentMethod =
          receipt instanceof File && receipt.size > 0
            ? 'MANUAL_RECEIPT'
            : 'NEXGO_N86';
        data.receiptKey =
          receipt instanceof File && receipt.size > 0
            ? await this.saveImage(receipt)
            : null;
        if (data.receiptKey) images.push(data.receiptKey);
        const sessionToken = action === 'register' ? `web_${randomBytes(32).toString('hex')}` : null;
        await this.repo.transaction(async (repo) => {
          if (photo) await repo.savePhoto(photo);
          await repo.createRequest(data);
          if (sessionToken) await repo.createSession(hash(sessionToken), null, data.id);
        });
        return { id: data.id, ...(sessionToken ? { token: sessionToken } : {}), status: 'PENDING' };
      } catch (error) {
        console.error('[Renewal SQL error]', error);
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
    if (action === 'complete-registration') {
      const identity = await this.identity(token);
      if (!identity.requestId) throw new ApiError(403, 'Registration session unavailable.');
      const requestId = text(form, 'requestId', 128);
      if (requestId !== identity.requestId) throw new ApiError(403, 'You cannot update this registration.');
      const payment = await this.repo.paymentTransactionByRequest(requestId);
      if (!payment || payment.paymentStatus !== 'PAID') throw new ApiError(400, 'Payment has not been confirmed yet.');
      const photo = await this.preparePhoto(form.get('photo'));
      const receipt = await this.saveImage(form.get('receipt'));
      try {
        await this.repo.transaction(async (repo) => {
          await repo.savePhoto(photo);
          await repo.completeRegistration(requestId, photo.storageKey, receipt);
        });
      } catch (error) {
        await this.removeImages([photo.storageKey, receipt]);
        throw error;
      }
      return { ok: true, status: 'PENDING', message: 'Registration submitted for gym approval.' };
    }
    if (action === 'update-profile') {
      const identity = await this.identity(token);
      const { staffId } = identity;
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
      const identity = await this.identity(token);
      const { staffId } = identity;
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
    if (action === 'pay-membership') {
      const requestId = text(form, 'requestId', 128);

      const paymentMethod =
        text(form, 'paymentMethod', 30, false) || 'NEXGO_N86';

      if (!['NEXGO_N86', 'HITPAY'].includes(paymentMethod)) {
        throw new ApiError(400, 'Unsupported payment method.');
      }

      if (paymentMethod === 'NEXGO_N86' && !this.sendSaleToTerminal) {
        throw new ApiError(503, 'NEXGO payment is not configured.');
      }

      if (paymentMethod === 'HITPAY' && !this.hitPayClient) {
        throw new ApiError(503, 'HitPay payment is not configured.');
      }

      if (!token) {
        throw new ApiError(401, 'Please sign in or verify your registration first.');
      }

      const identity = await this.identity(token);
      const paymentRequest = await this.repo.paymentRequest(requestId);

      if (!paymentRequest) {
        throw new ApiError(404, 'Pending membership request not found.');
      }

      const ownsRequest = paymentRequest.kind === 'REGISTER'
        ? identity.requestId === paymentRequest.id
        : Boolean(
            identity.staffId &&
            paymentRequest.staffId === identity.staffId
          );

      if (!ownsRequest) {
        throw new ApiError(403, 'You cannot pay for this membership request.');
      }

      const existingPayment =
        await this.repo.paymentTransactionByRequest(requestId);

      if (existingPayment) {
        if (existingPayment.paymentMethod !== paymentMethod) {
          return {
            success: false,
            invoice: existingPayment.invoiceNo,
            requestId,
            amountCents: existingPayment.amountCents,
            paymentStatus: existingPayment.paymentStatus,
            message:
              `A previous payment was started using ${existingPayment.paymentMethod}. Please check that transaction before choosing another payment method.`
          };
        }

        const status = existingPayment.paymentStatus;

        if (status === 'PAID') {
          return {
            success: true,
            invoice: existingPayment.invoiceNo,
            requestId,
            amountCents: existingPayment.amountCents,
            paymentStatus: 'PAID',
            message:
              'This membership request already has a recorded payment. No new charge was started.'
          };
        }

        if (status === 'PENDING' || status === 'UNKNOWN') {
          return {
            success: false,
            invoice: existingPayment.invoiceNo,
            requestId,
            amountCents: existingPayment.amountCents,
            paymentStatus: status,
            message:
              'A previous payment attempt may still be processing. Check the terminal and reconcile the existing transaction before trying again.'
          };
        }

        if (status === 'FAILED' && paymentMethod !== 'HITPAY') {
          return {
            success: false,
            invoice: existingPayment.invoiceNo,
            requestId,
            amountCents: existingPayment.amountCents,
            paymentStatus: 'FAILED',
            message:
              'A previous payment attempt failed. Verify its final status before authorizing another attempt.'
          };
        }

        // HITPAY: Previous payment is confirmed FAILED.
        // Allow a new payment attempt with a new invoice number.
      }

      const invoiceNo =
        `N${randomUUID().replaceAll('-', '')}`;

      const terminalInvoiceNo = paymentMethod === 'NEXGO_N86'
        ? `T${randomBytes(5).toString('hex').toUpperCase()}`
        : null;

      let created;

      try {
        // Creating the PENDING transaction is the reservation.
        // The database's unique index prevents duplicate pending rows.
        created = await this.repo.createPaymentTransaction({
          invoiceNo,
          terminalInvoiceNo,
          requestId,
          workspaceId: paymentRequest.workspaceId,
          paymentMethod
        });
      } catch (error) {
        // Another request may have created the payment first.
        const errorNumber =
          error.number ?? error.originalError?.info?.number;

        if (errorNumber === 2601 || errorNumber === 2627) {
          const existing =
            await this.repo.paymentTransactionByRequest(requestId);

          if (existing) {
            return {
              success: false,
              invoice: existing.invoiceNo,
              requestId,
              amountCents: existing.amountCents,
              paymentStatus: existing.paymentStatus,
              message:
                'A payment transaction already exists. Check its status before trying again.'
            };
          }
        }

        throw error;
      }

      const payment =
        Array.isArray(created) ? created[0] : created;

      if (
        !payment ||
        !Number.isInteger(payment.amountCents)
      ) {
        throw new ApiError(
          500,
          'Unable to prepare the payment transaction.'
        );
      }

      // HITPAY ONLINE PAYMENT
      if (paymentMethod === 'HITPAY') {
        const customer = identity.staff ?? identity.application;

        if (!this.hitPayClient.returnUrl) {
          throw new ApiError(
            503,
            'HitPay return URL is not configured.'
          );
        }

        try {
          const hitPayResponse =
            await this.hitPayClient.createPaymentRequest({
              amount: (payment.amountCents / 100).toFixed(2),
              currency: 'MYR',
              name: customer.name,
              email: customer.email || undefined,
              purpose: `Gym membership - ${paymentRequest.planName}`,
              reference_number: invoiceNo,
              redirect_url:
                `${this.hitPayClient.returnUrl}?requestId=${encodeURIComponent(requestId)}&paymentReturn=hitpay`
            });

          if (!hitPayResponse?.id || !hitPayResponse?.url) {
            throw new Error(
              'HitPay did not return a valid checkout URL.'
            );
          }

          const updatedPayment =
            await this.repo.updatePaymentTransaction({
              invoiceNo,
              paymentStatus: 'PENDING',
              terminalResponse: {
                provider: 'HITPAY',
                paymentRequestId: hitPayResponse.id,
                checkoutUrl: hitPayResponse.url,
                providerStatus: hitPayResponse.status
              }
            });

          if (!updatedPayment) {
            return {
              success: false,
              invoice: invoiceNo,
              requestId,
              paymentStatus: 'UNKNOWN',
              message:
                'HitPay checkout was created but the transaction could not be saved. Please reconcile before retrying.'
            };
          }

          return {
            success: true,
            paymentMethod: 'HITPAY',
            invoice: invoiceNo,
            requestId,
            amountCents: payment.amountCents,
            paymentStatus: 'PENDING',
            checkoutUrl: hitPayResponse.url,
            hitPayRequestId: hitPayResponse.id,
            message: 'Redirecting to HitPay checkout.'
          };

        } catch (error) {
          console.error('[HITPAY] Checkout creation error:', {
            invoiceNo,
            message: String(
              error.message ?? 'Unknown error'
            ).slice(0, 300)
          });

          await this.repo.updatePaymentTransaction({
            invoiceNo,
            paymentStatus: 'UNKNOWN',
            terminalResponse: {
              provider: 'HITPAY',
              message:
                'Checkout creation outcome could not be confirmed.',
              errorMessage: String(
                error.message ?? 'Unknown error'
              ).slice(0, 300)
            }
          }).catch(() => {});

          return {
            success: false,
            invoice: invoiceNo,
            requestId,
            amountCents: payment.amountCents,
            paymentStatus: 'UNKNOWN',
            message:
              'HitPay checkout status is uncertain. Check the transaction before retrying.'
          };
        }
      }

      try {
        const terminal = await this.sendSaleToTerminal(
          payment.amountCents,
          terminalInvoiceNo
        );

        const status = terminal.paymentConfirmed === true
          ? 'PAID'
          : 'UNKNOWN';

        const updatedPayment = await this.repo.updatePaymentTransaction({
          invoiceNo,
          paymentStatus: status,
          terminalResponse: terminal.parsed
        });

        if (!updatedPayment) {
          console.error(
            '[NEXGO PAYMENT] Terminal result could not be saved.',
            {
              invoiceNo,
              terminalInvoiceNo,
              paymentConfirmed: terminal.paymentConfirmed === true
            }
          );

          return {
            success: false,
            invoice: invoiceNo,
            requestId,
            amountCents: payment.amountCents,
            paymentStatus: 'UNKNOWN',
            message:
              'Terminal result could not be saved. Do not retry payment; reconcile the transaction first.'
          };
        }

        return {
          success: status === 'PAID',
          invoice: invoiceNo,
          requestId,
          amountCents: payment.amountCents,
          paymentStatus: status,
          message: status === 'PAID'
            ? 'Payment approved. Membership remains pending admin approval.'
            : status === 'UNKNOWN'
              ? 'Payment status is uncertain. Check the terminal before retrying.'
              : 'Payment was not confirmed. Check the terminal result.'
        };
      } catch (error) {
        await this.repo.updatePaymentTransaction({
          invoiceNo,
          paymentStatus: 'UNKNOWN',
          terminalResponse: {
            message: 'Terminal outcome could not be confirmed.',
            errorCode: error.code ?? null,
            errorMessage: String(error.message ?? 'Unknown error').slice(0, 300)
          }
        }).catch(() => {});

        return {
          success: false,
          invoice: invoiceNo,
          requestId,
          paymentStatus: 'UNKNOWN',
          message: 'Payment status is uncertain. Check the terminal before retrying.'
        };
      }
    }

    throw new ApiError(400, 'Unsupported action.');
  }

  async processHitPayWebhook(paymentRequestId) {
    if (!paymentRequestId) {
      throw new Error('HitPay payment request ID is missing.');
    }

    if (!this.hitPayClient) {
      throw new Error('HitPay is not configured.');
    }

    const savedPayment =
      await this.repo.paymentTransactionByHitPayRequestId(
        paymentRequestId
      );

    if (!savedPayment) {
      throw new Error('HitPay transaction was not found.');
    }

    if (savedPayment.paymentMethod !== 'HITPAY') {
      throw new Error('Transaction is not a HitPay payment.');
    }

    const paymentRequest =
      await this.repo.paymentRequestForHitPay(
        savedPayment.requestId
      );

    if (!paymentRequest) {
      throw new Error('Membership payment request was not found.');
    }

    let savedDetails = savedPayment.terminalResponse;

    if (typeof savedDetails === 'string') {
      try {
        savedDetails = JSON.parse(savedDetails);
      } catch {
        savedDetails = null;
      }
    }

    if (savedDetails?.paymentRequestId !== paymentRequestId) {
      throw new Error('HitPay payment request ID mismatch.');
    }

    const providerResult =
      await this.hitPayClient.getPaymentRequest(
        paymentRequestId
      );

    const providerStatus =
      String(providerResult?.status ?? '').toLowerCase();

    const providerAmount = Number(providerResult?.amount);

    const amountMatches =
      Number.isFinite(providerAmount) &&
      Math.round(providerAmount * 100) ===
        savedPayment.amountCents &&
      savedPayment.amountCents === paymentRequest.amountCents;

    const currencyMatches =
      String(providerResult?.currency ?? '').toUpperCase() ===
      'MYR';

    const referenceMatches =
      String(providerResult?.reference_number ?? '') ===
      savedPayment.invoiceNo;

    if (!amountMatches || !currencyMatches || !referenceMatches) {
      console.error('[HITPAY WEBHOOK] Verification mismatch:', {
        invoiceNo: savedPayment.invoiceNo,
        amountMatches,
        currencyMatches,
        referenceMatches
      });

      throw new Error('HitPay payment verification failed.');
    }

    if (providerStatus === 'pending') {
      return {
        success: true,
        paymentStatus: savedPayment.paymentStatus,
        message: 'HitPay payment is still pending.'
      };
    }

    if (['failed', 'expired', 'canceled', 'cancelled'].includes(providerStatus)) {
      if (savedPayment.paymentStatus === 'PAID') {
        throw new Error(
          'HitPay reports a failed status for an already-paid transaction. Reconciliation required.'
        );
      }

      const updatedPayment =
        await this.repo.updatePaymentTransaction({
          invoiceNo: savedPayment.invoiceNo,
          paymentStatus: 'FAILED',
          terminalResponse: {
            ...savedDetails,
            provider: 'HITPAY',
            verifiedStatus: providerStatus,
            verifiedAt: new Date().toISOString()
          }
        });

      if (!updatedPayment) {
        throw new Error('Unable to update failed payment status.');
      }

      return {
        success: true,
        paymentStatus: 'FAILED',
        message: 'HitPay payment was not successful.'
      };
    }

    if (providerStatus !== 'completed') {
      throw new Error(
        `Unrecognized HitPay payment status: ${providerStatus || 'empty'}`
      );
    }

    const updatedPayment =
      await this.repo.updatePaymentTransaction({
        invoiceNo: savedPayment.invoiceNo,
        paymentStatus: 'PAID',
        terminalResponse: {
          ...savedDetails,
          provider: 'HITPAY',
          verifiedStatus: 'completed',
          verifiedAmount: providerResult.amount,
          verifiedCurrency: providerResult.currency,
          verifiedReference: providerResult.reference_number,
          verifiedAt: new Date().toISOString()
        }
      });

    if (!updatedPayment) {
      throw new Error(
        'Payment was confirmed but could not be saved.'
      );
    }

    return {
      success: true,
      invoice: savedPayment.invoiceNo,
      requestId: savedPayment.requestId,
      paymentStatus: 'PAID',
      message: paymentRequest.kind === 'REGISTER'
        ? 'Payment confirmed. Registration is pending admin approval.'
        : 'Payment confirmed. Review and submit your renewal to update your membership.'
    };
  }
}
