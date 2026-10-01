import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtpSender } from './whatsapp.js';
import { MemberService } from './member-service.js';

const env = { PERISKOPE_API_KEY: 'test-key', PERISKOPE_PHONE: '60111111111' };
const form = (action, otp) => {
  const data = new FormData();
  data.set('action', action);
  data.set('phone', '60123456789');
  if (otp) data.set('otp', otp);
  return data;
};
function fixture(send) {
  let code;
  let sessions = 0;
  const service = new MemberService({
    registrationExists: async () => false,
    createSession: async () => { sessions++; },
  }, 'unused', { sendOtp: async (phone, otp) => { code = otp; await send?.(phone, otp); } });
  return { service, code: () => code, sessions: () => sessions };
}

test('sender uses Periskope queue API and keeps credentials in headers', async () => {
  const send = createOtpSender(env, async (url, options) => {
    assert.equal(String(url), 'https://api.periskope.app/v1/message/send');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.headers['x-phone'], env.PERISKOPE_PHONE);
    const body = JSON.parse(options.body);
    assert.equal(body.chat_id, '60123456789@c.us');
    assert.match(body.message, /123456/);
    return Response.json({ queue_id: 'queued' });
  });
  await send('60123456789', '123456');
});

test('sender rejects missing configuration, HTTP failures, malformed acknowledgements and network failures', async () => {
  await assert.rejects(createOtpSender({})('60123456789', '123456'));
  for (const reply of [() => new Response('', { status: 401 }), () => Response.json({}), () => { throw new Error('timeout'); }]) {
    await assert.rejects(createOtpSender(env, async () => reply())('60123456789', '123456'));
  }
});

test('OTP is delivered, hashed in memory and accepted exactly once even concurrently', async () => {
  const f = fixture();
  await f.service.post(form('request-otp'), null, 'test');
  assert.match(f.code(), /^\d{6}$/);
  assert.equal(f.service.otpStore.get('60123456789').otp, undefined);
  const results = await Promise.allSettled([1, 2].map(() => f.service.post(form('verify-otp', f.code()), null, 'test')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.sessions(), 0);
  assert.equal(f.service.registrationTokens.size, 1);
});

test('failed delivery leaves no usable OTP and repeated sends are limited', async () => {
  const f = fixture(async () => { throw new Error('provider secret'); });
  await assert.rejects(f.service.post(form('request-otp'), null, 'test'), e => e.status === 502 && !e.message.includes('secret'));
  assert.equal(f.service.otpStore.size, 0);
  await assert.rejects(f.service.post(form('request-otp'), null, 'other-ip'), e => e.status === 429);
});

test('five wrong codes invalidate the OTP across different IPs', async () => {
  const f = fixture();
  await f.service.post(form('request-otp'), null, 'test');
  for (let i = 0; i < 5; i++) {
    await assert.rejects(f.service.post(form('verify-otp', '000000'), null, `ip-${i}`), e => e.status === 401);
  }
  await assert.rejects(f.service.post(form('verify-otp', f.code()), null, 'new-ip'), e => e.status === 401);
  assert.equal(f.sessions(), 0);
});

test('expired OTP cannot create a session', async () => {
  const f = fixture();
  await f.service.post(form('request-otp'), null, 'test');
  f.service.otpStore.get('60123456789').expiresAt = 0;
  await assert.rejects(f.service.post(form('verify-otp', f.code()), null, 'test'), e => e.status === 401);
});

test('local Malaysian OTP numbers use the international recipient and same verification record', async () => {
  for (const input of ['0167619166', '60167619166', '+60 16-761 9166']) {
    let code;
    const service = new MemberService({
      registrationExists: async number => {
        assert.equal(number, '60167619166');
        return false;
      },
      createSession: async () => {},
    }, 'unused', { sendOtp: async (number, otp) => {
      assert.equal(number, '60167619166');
      code = otp;
    } });
    const request = form('request-otp');
    request.set('phone', input);
    await service.post(request, null, 'test');
    const duplicate = form('request-otp');
    duplicate.set('phone', '60167619166');
    await assert.rejects(service.post(duplicate, null, 'other-ip'), e => e.status === 429);
    const verify = form('verify-otp', code);
    verify.set('phone', '0167619166');
    const result = await service.post(verify, null, 'test');
    assert.match(result.registrationToken, /^[a-f0-9]{64}$/);
  }
});

test('sender refuses a local recipient before contacting Periskope', async () => {
  const send = createOtpSender(env, async () => assert.fail('Must not send to a local number'));
  await assert.rejects(send('0167619166', '123456'), /country code/);
});
