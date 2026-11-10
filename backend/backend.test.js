import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig } from './config.js';
import { createApp } from './app.js';
import { MemberService } from './member-service.js';

const env = {
  DB_SERVER: 'sql.example.test', DB_PORT: '1434', DB_USER: 'test',
  DB_PASSWORD: 'test-secret', DB_DATABASE: 'test-db',
};

test('missing password stops setup without exposing credentials', () => {
  assert.throws(() => databaseConfig({ ...env, DB_PASSWORD: '' }), /Set DB_PASSWORD/);
  assert.throws(() => databaseConfig({ ...env, DB_PORT: 'bad' }), /DB_PORT/);
  const config = databaseConfig(env);
  assert.equal(config.port, 1434);
  assert.equal(config.options.encrypt, true);
  assert.equal(config.options.trustServerCertificate, false);
});

test('health, allowed origins and incomplete member routes are explicit', async (t) => {
  let fail = false;
  let queries = 0;
  const server = createApp({
    origins: ['http://localhost:8080'],
    checkDatabase: async () => {
      queries++;
      if (fail) throw new Error('private database details');
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${url}/api/health`, {
    headers: { Origin: 'http://localhost:8080' },
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  assert.equal((await health.json()).memberApi, 'pending-schema-mapping');
  const blocked = await fetch(`${url}/api/health`, {
    headers: { Origin: 'https://unrelated.example' },
  });
  assert.equal(blocked.status, 403);
  await blocked.text();
  assert.equal(queries, 1);
  fail = true;
  const unavailable = await fetch(`${url}/api/health`);
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private database details/);
  const login = await fetch(`${url}/api/member-app`, { method: 'POST' });
  assert.equal(login.status, 503);
  assert.match(await login.text(), /not complete/);
});

/*
test('SQL-backed demo login uses the selected workspace and persistent session architecture', async (t) => {
  const allowlistedPhone = '60123456789';
  const member = {
    id: 'north-member',
    memberId: 'north-demo',
    name: 'Approved Demo Member',
    phone: allowlistedPhone,
    email: null,
    birthDate: null,
    photoKey: null,
    memberPhotoKey: null,
    pushEnabled: true,
  };
  const demoLogin = { enabled: true, phones: new Set([allowlistedPhone]) };
  const sessionsByWorkspace = new Map();
  const services = new Map();
  const members = workspace => {
    if (!services.has(workspace)) {
      const sessions = new Map();
      sessionsByWorkspace.set(workspace, sessions);
      const repository = {
        workspaces: async () => [{ code: 'north', name: 'North Gym' }, { code: 'south', name: 'South Gym' }],
        staffByPhone: async phone => workspace === 'north' && phone === allowlistedPhone ? member : null,
        createSession: async (tokenHash, staffId, requestId) => {
          sessions.set(tokenHash, { staffId, requestId });
        },
        session: async tokenHash => sessions.get(tokenHash),
        staff: async id => workspace === 'north' && id === member.id ? member : null,
        membership: async () => null,
        requests: async () => [],
      };
      services.set(workspace, new MemberService(repository, 'unused', { demoLogin }));
    }
    return services.get(workspace);
  };
  const server = createApp({
    origins: [],
    checkDatabase: async () => {},
    members,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/member-app`;

  const health = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { database: 'connected', memberApi: 'ready' });

  const workspaces = await fetch(`${url}?view=workspaces`);
  assert.deepEqual(await workspaces.json(), {
    workspaces: [{ code: 'north', name: 'North Gym' }, { code: 'south', name: 'South Gym' }],
    demoLogin: true,
  });

  const wrongWorkspaceForm = new FormData();
  wrongWorkspaceForm.set('action', 'demo-login');
  wrongWorkspaceForm.set('phone', allowlistedPhone);
  const wrongWorkspace = await fetch(url, {
    method: 'POST',
    headers: { 'X-Workspace': 'south' },
    body: wrongWorkspaceForm,
  });
  assert.equal(wrongWorkspace.status, 401);

  const unapprovedForm = new FormData();
  unapprovedForm.set('action', 'demo-login');
  unapprovedForm.set('phone', '60111111111');
  const unapproved = await fetch(url, {
    method: 'POST',
    headers: { 'X-Workspace': 'north' },
    body: unapprovedForm,
  });
  assert.equal(unapproved.status, 401);

  const loginForm = new FormData();
  loginForm.set('action', 'demo-login');
  loginForm.set('phone', allowlistedPhone);
  const login = await fetch(url, {
    method: 'POST',
    headers: { 'X-Workspace': 'north' },
    body: loginForm,
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.equal(sessionsByWorkspace.get('north').size, 1);
  assert.equal(sessionsByWorkspace.get('south').size, 0);
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Workspace': 'north',
  };
  for (let refresh = 0; refresh < 2; refresh++) {
    const dashboard = await fetch(`${url}?view=me`, { headers });
    assert.equal(dashboard.status, 200);
    const member = await dashboard.json();
    assert.equal(member.name, 'Approved Demo Member');
    assert.equal(member.approved, true);
  }

  const crossWorkspace = await fetch(`${url}?view=me`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Workspace': 'south' },
  });
  assert.equal(crossWorkspace.status, 401);
});
*/
