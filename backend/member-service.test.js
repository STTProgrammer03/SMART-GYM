import test from 'node:test';
import assert from 'node:assert/strict';
import { MemberService, attendanceDays } from './member-service.js';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function formFor(action, fields = {}) {
  const form = new FormData();
  form.set('action', action);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

test('phone-only login supports existing members and pending applications without sending OTP', async () => {
  let saved;
  const repo = {
    staffByPhone: async number => { assert.equal(number, '60167619166'); return { id: 'member' }; },
    applicationByPhone: async () => null,
    createSession: async (...args) => { saved = args; },
  };
  const service = new MemberService(repo, 'unused', { sendOtp: async () => assert.fail('No OTP for login') });
  const form = formFor('login', { phone: '0167619166' });
  assert.match((await service.post(form, null, 'test')).token, /^web_/);
  assert.equal(saved[1], 'member');
  repo.staffByPhone = async () => null;
  await assert.rejects(service.post(form, null, 'test'), e => e.status === 401);
  repo.applicationByPhone = async () => ({ id: 'pending' });
  await service.post(form, null, 'test');
  assert.equal(saved[1], null);
  assert.equal(saved[2], 'pending');
});

test('registration requires phone-bound verification; receipt is optional and proof is single use', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'member-registration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let code, request;
  const repo = {
    registrationExists: async () => false,
    plans: async () => [{ id: 'plan-a' }],
    transaction: async action => action(repo),
    savePhoto: async photo => { assert.ok(Buffer.isBuffer(photo.bytes)); },
    createRequest: async data => { request = data; },
    createSession: async (_, staffId, requestId) => {
      assert.equal(staffId, null); assert.equal(requestId, request.id);
    },
  };
  const service = new MemberService(repo, directory, { sendOtp: async (_, otp) => { code = otp; } });
  const form = formFor('register', { fullName: 'Test Member', phone: '0167619166', planId: 'plan-a' });
  const photo = new Blob([Buffer.from([255,216,255,224])], { type: 'image/jpeg' });
  form.set('photo', photo, 'photo.jpg');
  await assert.rejects(service.post(form, null, 'test'), e => e.status === 401);
  await service.post(formFor('request-otp', { phone: '0167619166' }), null, 'test');
  const verified = await service.post(formFor('verify-otp', { phone: '60167619166', otp: code }), null, 'test');
  assert.equal(verified.token, undefined);
  form.set('registrationToken', verified.registrationToken);
  form.set('phone', '60111111111');
  await assert.rejects(service.post(form, null, 'test'), e => e.status === 401);
  form.set('phone', '0167619166');
  form.set('planId', 'unavailable');
  await assert.rejects(service.post(form, null, 'test'), e => e.status === 400);
  form.set('planId', 'plan-a');
  const results = await Promise.allSettled([1, 2].map(() => service.post(form, null, 'test')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const result = results.find(r => r.status === 'fulfilled').value;
  assert.equal(result.status, 'PENDING');
  assert.match(result.token, /^web_/);
  assert.equal(request.phone, '60167619166');
  assert.equal(request.planId, 'plan-a');
  assert.equal(request.receiptKey, null);
  assert.deepEqual(await readdir(directory), []);
  await assert.rejects(service.post(form, null, 'test'), e => e.status === 401);
});

test('pay-membership serializes concurrent payment attempts and blocks UNKNOWN retries', async () => {
  const requestId = 'request-1';
  const payment = {
    invoiceNo: 'N-first',
    requestId,
    amountCents: 6600,
    paymentStatus: 'PENDING'
  };
  let existingPayment = null;
  let reserveCalls = 0;
  let transactionCalls = 0;
  let terminalCalls = 0;
  let releaseTerminal;
  let markTerminalStarted;
  const terminalStarted = new Promise(resolve => { markTerminalStarted = resolve; });
  const terminalRelease = new Promise(resolve => { releaseTerminal = resolve; });

  const repo = {
    session: async () => ({ staffId: null, requestId }),
    application: async () => ({ id: requestId, status: 'PENDING' }),
    paymentRequest: async id => id === requestId
      ? { id: requestId, kind: 'REGISTER', staffId: null, workspaceId: 'gym', amountCents: 6600 }
      : null,
    paymentTransactionByRequest: async () => existingPayment,
    reservePaymentRequest: async () => {
      reserveCalls++;
      return reserveCalls === 1;
    },
    createPaymentTransaction: async () => {
      transactionCalls++;
      existingPayment = { ...payment };
      return payment;
    },
    updatePaymentTransaction: async ({ paymentStatus }) => {
      existingPayment = { ...existingPayment, paymentStatus };
    }
  };

  const service = new MemberService(repo, 'unused', {
    sendSaleToTerminal: async () => {
      terminalCalls++;
      markTerminalStarted();
      await terminalRelease;
      return {
        paymentConfirmed: false,
        parsed: { statusCode: 'EA', pending: true }
      };
    }
  });

  const paymentForm = formFor('pay-membership', { requestId });
  const first = service.post(paymentForm, 'web_' + 'a'.repeat(64), 'test');

  await terminalStarted;
  const second = await service.post(
    formFor('pay-membership', { requestId }),
    'web_' + 'a'.repeat(64),
    'test'
  );

  assert.equal(second.paymentStatus, 'PENDING');
  assert.equal(terminalCalls, 1);
  assert.equal(transactionCalls, 1);

  releaseTerminal();
  const firstResult = await first;
  assert.equal(firstResult.paymentStatus, 'UNKNOWN');
  assert.equal(terminalCalls, 1);

  const third = await service.post(
    formFor('pay-membership', { requestId }),
    'web_' + 'a'.repeat(64),
    'test'
  );

  assert.equal(third.paymentStatus, 'UNKNOWN');
  assert.equal(terminalCalls, 1);
  assert.equal(transactionCalls, 1);
});

test('existing accounts cannot request registration OTP', async () => {
  const service = new MemberService({ registrationExists: async () => true }, 'unused', {
    sendOtp: async () => assert.fail('Existing accounts must not receive registration OTP'),
  });
  await assert.rejects(service.post(formFor('request-otp', { phone: '60123456789' }), null, 'test'), e => e.status === 409);
});

test('expired registration verification cannot create a request', async () => {
  const service = new MemberService({ plans: async () => [{ id: 'plan' }] }, 'unused');
  const { createHash } = await import('node:crypto');
  service.registrationTokens.set(createHash('sha256').update('expired').digest('hex'), { phone: '60123456789', expiresAt: 0 });
  await assert.rejects(service.post(formFor('register', { phone: '60123456789', fullName: 'Test', planId: 'plan', registrationToken: 'expired' }), null, 'test'), e => e.status === 401);
});

test('attendance uses Malaysia dates and does not invent missing exit times', () => {
  const days = attendanceDays([
    { direction: 'ENTRY', occurredAt: '2026-09-21T17:00:00Z' },
    { direction: 'EXIT', occurredAt: '2026-09-21T18:30:00Z' },
    { direction: 'ENTRY', occurredAt: '2026-09-20T01:00:00Z' },
  ], new Date('2026-09-22T10:00:00Z'));
  assert.equal(days.length, 7);
  assert.equal(days.at(-1).date, '2026-09-22');
  assert.equal(days.at(-1).durationMinutes, 90);
  assert.equal(days.find((d) => d.date === '2026-09-20').status, 'incomplete');
});

test('login rejects wrong phone and limits repeated attempts', async () => {
  const service = new MemberService({
    staff: async () => ({ id: 'member', phone: '60123456789' }),
    createSession: async () => assert.fail('Must not issue a session'),
  }, 'unused');
  const form = new FormData();
  form.set('action', 'login'); form.set('memberId', 'member'); form.set('phone', '60111111111');
  for (let i = 0; i < 10; i++) {
    await assert.rejects(service.post(form, null, 'local'), (e) => e.status === 401);
  }
  await assert.rejects(service.post(form, null, 'local'), (e) => e.status === 429);
});

test('expired or other-workspace session cannot access member data', async () => {
  const service = new MemberService({ session: async () => null }, 'unused');
  await assert.rejects(service.get('me', 'web_' + 'a'.repeat(64)), (e) => e.status === 401);
  await assert.rejects(service.get('settings', 'invalid'), (e) => e.status === 401);
});

test('photo upload persists for another session and only updates the authenticated member photo', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'member-photo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let photoKey;
  const media = new Map();
  const repo = {
    session: async () => ({ staffId: 'member-a' }),
    staff: async () => ({ id: 'member-a', photoKey }),
    transaction: async action => action(repo),
    savePhoto: async photo => { media.set(photo.storageKey, photo); },
    mediaPhoto: async key => media.get(key),
    updatePhoto: async (id, key) => { assert.equal(id, 'member-a'); photoKey = key; },
  };
  const service = new MemberService(repo, directory);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.set('action', 'upload-photo');
  form.set('photo', new Blob([png], { type: 'image/png' }), 'face.png');
  const saved = await service.post(form, 'web_' + 'a'.repeat(64), 'local');
  assert.match(saved.photoKey, /^[a-f0-9-]+\.png$/);
  assert.deepEqual(await readdir(directory), []);
  const anotherService = new MemberService(repo, directory);
  const photo = await anotherService.get('photo', 'web_' + 'b'.repeat(64));
  assert.deepEqual(photo.bytes, png);
  assert.equal(photo.contentType, 'image/png');
  repo.session = async () => ({ staffId: 'member-b' });
  repo.staff = async () => ({ id: 'member-b', photoKey: null });
  await assert.rejects(service.get('photo', 'web_' + 'c'.repeat(64)), e => e.status === 404);
});

test('photo upload cleans up files if SQL fails and rejects invalid images and sessions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'member-photo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new MemberService({
    session: async () => ({ staffId: 'member' }),
    staff: async () => ({ id: 'member' }),
    transaction: async () => { throw new Error('SQL failure'); },
  }, directory);
  const form = new FormData();
  form.set('action', 'upload-photo');
  form.set('photo', new Blob([Buffer.from([137,80,78,71,13,10,26,10])]), 'face.png');
  await assert.rejects(service.post(form, null, 'local'), e => e.status === 401);
  await assert.rejects(service.post(form, 'web_' + 'a'.repeat(64), 'local'), /SQL failure/);
  assert.deepEqual(await readdir(directory), []);
  form.set('photo', new Blob(['not an image']), 'face.png');
  await assert.rejects(service.post(form, 'web_' + 'a'.repeat(64), 'local'), e => e.status === 400);
});

test('existing company photos are read from media_files using only the session member photo key', async () => {
  const bytes = Buffer.from([255, 216, 255, 224]);
  const requested = [];
  const repo = {
    session: async () => ({ staffId: 'member-a' }),
    staff: async () => ({ id: 'member-a', photoKey: 'company-photo.jpg' }),
    mediaPhoto: async key => { requested.push(key); return { bytes, contentType: 'text/html' }; },
  };
  const service = new MemberService(repo, 'unused');
  await assert.rejects(service.get('photo', 'invalid'), e => e.status === 401);
  assert.equal(requested.length, 0);
  const result = await service.get('photo', 'web_' + 'a'.repeat(64));
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.contentType, 'image/jpeg');
  assert.deepEqual(requested, ['company-photo.jpg']);
  repo.mediaPhoto = async () => null;
  await assert.rejects(service.get('photo', 'web_' + 'a'.repeat(64)), e => e.status === 404);
  repo.mediaPhoto = async () => ({ bytes: Buffer.from('<svg></svg>'), contentType: 'image/jpeg' });
  await assert.rejects(service.get('photo', 'web_' + 'a'.repeat(64)), e => e.status === 404);
});

