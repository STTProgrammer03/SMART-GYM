import { databaseConfig, serverConfig, loadEnvironment } from './config.js';
import { createDatabase, connectionError } from './database.js';
import { createApp } from './app.js';
import { MemberRepository } from './member-repository.js';
import { MemberService } from './member-service.js';
import { fileURLToPath } from 'node:url';
import { createOtpSender } from './whatsapp.js';
import { resolve } from 'node:path';
import {
  testTerminalConnection,
  sendSaleToTerminal
} from './nexgo-ecr.js';

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
    const serviceByWorkspace = new Map();
    const server = createApp({
      origins: config.origins,
      checkDatabase: () => pool.request().query('SELECT 1 AS connected'),

            testTerminalConnection,
      sendSaleToTerminal,
      nexgoUatEnabled: env.NEXGO_UAT_ENABLED === 'true',
      nexgoMaxTestAmountCents: Number(env.NEXGO_MAX_TEST_AMOUNT_CENTS),

members: (workspace = config.workspace) => {
        if (!serviceByWorkspace.has(workspace)) {
          serviceByWorkspace.set(workspace, new MemberService(
            new MemberRepository(pool, workspace),
            env.MEMBER_UPLOAD_DIRECTORY
              ? resolve(env.MEMBER_UPLOAD_DIRECTORY)
              : fileURLToPath(new URL('uploads/', import.meta.url)),
            {
              sendOtp: createOtpSender(env),
              sendSaleToTerminal
            }
          ));
        }
        return serviceByWorkspace.get(workspace);
      },
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
