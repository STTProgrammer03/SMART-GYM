// Explicit integration check: fixture writes are always rolled back.
import assert from 'node:assert/strict';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { databaseConfig, serverConfig, loadEnvironment } from './config.js';
import { createDatabase, connectionError } from './database.js';
import { MemberRepository } from './member-repository.js';
import { MemberService } from './member-service.js';
import { createApp } from './app.js';

const env = loadEnvironment();
const config = serverConfig(env);
const pool = createDatabase(databaseConfig(env));
let transaction, server, directory, started = false;
try {
  await pool.connect();
  transaction = new sql.Transaction(pool);
  await transaction.begin();
  started = true;
  const repo = new MemberRepository(transaction, config.workspace, true);
  directory = await mkdtemp(join(tmpdir(), 'membership-check-'));
  let deliveredCode;
  const members = new MemberService(repo, directory, { sendOtp: async (_, otp) => { deliveredCode = otp; } });
  server = createApp({ origins: ['http://localhost:8080'], members, checkDatabase: async () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/member-app`;
  const post = async (fields, token, images = false) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    if (images) {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
      form.set('photo', new Blob([png], { type: 'image/png' }), 'test.png');
      form.set('receipt', new Blob([png], { type: 'image/png' }), 'test.png');
    }
    const response = await fetch(url, { method: 'POST', body: form,
      headers: { Origin: 'http://localhost:8080', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  };
  const get = async (view, token) => {
    const response = await fetch(`${url}?view=${view}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, 200);
    return response.json();
  };
  const plans = (await get('plans')).plans;
  assert.ok(plans.length, 'No active membership plans in selected workspace.');
  await post({ action: 'request-otp', phone: '60000000000' });
  const verification = await post({ action: 'verify-otp', phone: '60000000000', otp: deliveredCode });
  const registered = await post({ action: 'register', fullName: 'TRANSACTION ROLLBACK TEST',
    phone: '60000000000', email: 'test@example.invalid', planId: plans[0].id, registrationToken: verification.registrationToken }, null, true);
  const registrationRow = (await repo.query('SELECT plan_id,receipt_key FROM dbo.member_app_requests WHERE id=@id AND workspace_id=@workspace', { id: registered.id }))[0];
  assert.equal(registrationRow.plan_id, plans[0].id);
  assert.match(registrationRow.receipt_key, /^web\//);
  const pending = await get('me', registered.token);
  assert.equal(pending.approved, false);
  assert.equal(pending.requests[0].status, 'PENDING');
  assert.equal(pending.memberId, registered.id);
  assert.equal(pending.registrationStatus, 'PENDING');
  assert.ok(pending.photoKey);
  const storedPhoto = await repo.mediaPhoto(pending.photoKey);
  assert.ok(storedPhoto.bytes.length > 0);
  assert.equal(storedPhoto.contentType, 'image/png');

  assert.equal(pending.requests[0].plan, plans[0].name);
  const pendingLogin = await post({ action: 'login', phone: '60000000000' });
  assert.equal((await get('me', pendingLogin.token)).approved, false);
  const photo = await fetch(`${url}?view=photo`, { headers: { Authorization: `Bearer ${registered.token}` } });
  assert.equal(photo.status, 200); await photo.arrayBuffer();
  await get('settings', registered.token); await get('attendance', registered.token);
  await post({ action: 'login', memberId: registered.id, phone: '60000000000' });
  const other = new MemberService(new MemberRepository(transaction, 'unrelated-workspace', true), directory);
  await assert.rejects(other.get('me', registered.token), (e) => e.status === 401);
  const expiredHash = (await import('node:crypto')).createHash('sha256').update(registered.token).digest('hex');
  await repo.query('UPDATE dbo.member_app_sessions SET expires_at=DATEADD(day,-1,SYSUTCDATETIME()) WHERE workspace_id=@workspace AND token_hash=@hash', { hash: expiredHash });
  await assert.rejects(members.get('me', registered.token), (e) => e.status === 401);

  const staffId = randomUUID();
  await repo.query(`INSERT INTO dbo.isapi_staff
    (id,employee_no,full_name,whatsapp_number,is_active,person_type,created_at,updated_at,workspace_id)
    VALUES(@id,@id,'TRANSACTION ROLLBACK TEST','60000000001',1,'MEMBER',SYSUTCDATETIME(),SYSUTCDATETIME(),@workspace)`, { id: staffId });
  const loggedIn = await post({ action: 'login', phone: '60000000001' });
  assert.equal((await get('me', loggedIn.token)).approved, true);
  await get('attendance', loggedIn.token);
  await post({ action: 'update-profile', name: 'TRANSACTION ROLLBACK TEST', phone: '60000000001',
    email: '', birthDate: '2000-01-01' }, loggedIn.token);
  assert.equal((await get('me', loggedIn.token)).birthDate, '2000-01-01');
  const uploaded = await post({ action: 'upload-photo' }, loggedIn.token, true);
  const shared = (await repo.query('SELECT s.photo_key,p.photo_key AS profile_key FROM dbo.isapi_staff s JOIN dbo.member_app_profiles p ON p.staff_id=s.id WHERE s.id=@id AND s.workspace_id=@workspace', { id: staffId }))[0];
  assert.equal(shared.photo_key, uploaded.photoKey);
  assert.equal(shared.profile_key, uploaded.photoKey);
  assert.ok((await repo.mediaPhoto(uploaded.photoKey)).bytes.length);

  await post({ action: 'renew', planId: plans[0].id }, loggedIn.token, true);
  assert.equal((await get('me', loggedIn.token)).requests[0].kind, 'RENEW');
  await post({ action: 'logout' }, loggedIn.token);
  const loggedOut = await fetch(`${url}?view=me`, { headers: { Authorization: `Bearer ${loggedIn.token}` } });
  assert.equal(loggedOut.status, 401); await loggedOut.text();
  console.log('PASS: plans, registration, pending profile, photos, login, settings, attendance, profile update, renewal, logout, expiry and workspace isolation.');
} catch (error) {
  console.error(error.code ? connectionError(error) : error.message);
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (started) {
    await transaction.rollback();
    console.log('All database test writes rolled back.');
  }
  await pool.close();
  if (directory) {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('membership-check-'));
    await rm(target, { recursive: true, force: true });
  }
}
