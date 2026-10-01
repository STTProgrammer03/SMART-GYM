import { databaseConfig, serverConfig, loadEnvironment } from './config.js';
import { createDatabase, connectionError } from './database.js';
import { createApp } from './app.js';
import { MemberRepository } from './member-repository.js';
import { MemberService } from './member-service.js';
import { fileURLToPath } from 'node:url';
import { createOtpSender } from './whatsapp.js';
import { resolve } from 'node:path';

let pool;
try {
  const env = loadEnvironment();
  let dbConfig;
  let config;
  try {
    dbConfig = databaseConfig(env);
    config = serverConfig(env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  if (dbConfig && config) {
    pool = createDatabase(dbConfig);
    await pool.connect();
    const server = createApp({
      origins: config.origins,
      checkDatabase: () => pool.request().query('SELECT 1 AS connected'),
      members: new MemberService(new MemberRepository(pool, config.workspace),
        env.MEMBER_UPLOAD_DIRECTORY ? resolve(env.MEMBER_UPLOAD_DIRECTORY) :
          fileURLToPath(new URL('uploads/', import.meta.url)), { sendOtp: createOtpSender(env) }),
    });
    server.on('error', async () => {
      console.error('Cannot start the local backend. Check whether PORT is already in use.');
      await pool.close();
      process.exitCode = 1;
    });
    server.listen(config.port, '127.0.0.1', () => {
      console.log(`Database connection check: http://localhost:${config.port}/api/health`);
      console.log(`Member API ready for workspace: ${config.workspace}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        server.close(async () => { await pool.close(); });
      });
    }
  }
} catch (error) {
  console.error(connectionError(error));
  await pool?.close();
  process.exitCode = 1;
}
