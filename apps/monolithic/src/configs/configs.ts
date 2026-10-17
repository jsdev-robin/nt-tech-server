import dotenv from 'dotenv';
import { ProcessEnv } from './types';

dotenv.config({
  path: './.env',
  quiet: true,
  debug: process.env.DEBUG === 'true',
});

const defaults: Partial<ProcessEnv> = {
  NODE_ENV: 'development',
  PORT: '8000',
};

const env = {
  ...defaults,
  ...process.env,
} as ProcessEnv;

const requiredVars: Array<keyof ProcessEnv> = [
  // Server
  'NODE_ENV',
  'DOMAIN',
  'PORT',

  // Database
  'DATABASE_ONLINE',
  'DATABASE_PASSWORD_ONLINE',

  // Redis / Upstash
  'NODE_REDIS_URL',
  'NODE_REDIS_PORT',
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',

  // IP Request
  'IPINFO_KEY',

  // Client URL
  'WEB_CLIENT_URL',
  'ADMIN_CLIENT_URL',
  'AGENT_CLIENT_URL',

  // Passkeys
  'RP_NAME',
  'RP_ID',

  // Secrets & Encryption
  'EMAIL_CHANGE_SECRET',
  'COOKIE_SECRET',
  'ACTIVATION_SECRET',
  'CRYPTO_SECRET',
  'HMAC_SECRET',
  'ACCESS_TOKEN',
  'REFRESH_TOKEN',
  'PROTECT_TOKEN',
];

function validateEnv(env: ProcessEnv): void {
  const missing = requiredVars.filter(
    (key) => !env[key] || env[key].trim() === '',
  );

  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

validateEnv(env);

const config: ProcessEnv & {
  ISPRODUCTION: boolean;
  DB: string;
} = {
  ...env,
  ISPRODUCTION: env.NODE_ENV === 'production',
  DB: env.DATABASE_ONLINE.replace(
    '<db_password>',
    env.DATABASE_PASSWORD_ONLINE,
  ),
};

export { config };
