import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig } from './config.js';
import { createApp } from './app.js';

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
