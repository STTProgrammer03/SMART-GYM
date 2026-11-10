import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function loadEnvironment() {
  let local = {};
  try {
    local = parseEnv(readFileSync(new URL('.env', import.meta.url), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...local, ...process.env };
}

function port(value, name, fallback) {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`${name} must be a port between 1 and 65535.`);
  }
  return number;
}

function boolean(value, name, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

export function databaseConfig(env) {
  for (const key of ['DB_SERVER', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE']) {
    if (!env[key]?.trim()) {
      throw new Error(`Set ${key} in backend/.env before connecting.`);
    }
  }
  return {
    server: env.DB_SERVER.trim(),
    port: port(env.DB_PORT, 'DB_PORT', 1434),
    user: env.DB_USER.trim(),
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE.trim(),
    connectionTimeout: 10000,
    requestTimeout: 10000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: boolean(env.DB_ENCRYPT, 'DB_ENCRYPT', true),
      trustServerCertificate: boolean(
        env.DB_TRUST_SERVER_CERTIFICATE, 'DB_TRUST_SERVER_CERTIFICATE', false,
      ),
      appName: 'Membership Website',
    },
  };
}

export function serverConfig(env) {
  return {
    workspace: env.MEMBER_WORKSPACE_ID?.trim() || 'legacy-workspace',
    port: port(env.PORT, 'PORT', 3000),
   origins: (env.WEBSITE_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080,http://localhost:52490,http://192.168.2.165:52490')
      .split(',').map((value) => value.trim()).filter(Boolean),
  };
}

export function otpConfig(env) {
  return { enabled: boolean(env.OTP_ENABLED, 'OTP_ENABLED', true) };
}

export function hitPayConfig(env) {
  const environment = (env.HITPAY_ENV || 'sandbox').trim();

  if (!['sandbox', 'production'].includes(environment)) {
    throw new Error('HITPAY_ENV must be sandbox or production.');
  }

  return {
    environment,
    apiKey: env.HITPAY_API_KEY?.trim() || '',
    salt: env.HITPAY_SALT?.trim() || '',
    webhookSalt: env.HITPAY_WEBHOOK_SALT?.trim() || '',
    baseUrl: environment === 'sandbox'
      ? 'https://api.sandbox.hit-pay.com'
      : 'https://api.hit-pay.com',
    returnUrl: env.HITPAY_RETURN_URL?.trim() || '',
    webhookUrl: env.HITPAY_WEBHOOK_URL?.trim() || '',
  };
}

export function nexgoConfig(env) {
  return {
    terminalUrl: env.NEXGO_TERMINAL_URL?.trim()
      || 'http://192.168.2.193:33898/'
  };
}
