import dotenv from 'dotenv';
import { ProcessEnv } from './types';

dotenv.config({
  path: './.env',
  quiet: true,
  debug: process.env.DEBUG === 'true',
});

const requiredVars: Array<keyof ProcessEnv> = [
  'NODE_ENV',
  'DOMAIN',
  'PORT',

  // Database
  'DATABASE_ONLINE',
  'DATABASE_PASSWORD_ONLINE',

  // Redis
  'NODE_REDIS_URL',
  'NODE_REDIS_PORT',
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',

  // Security & Auth
  'IPINFO_KEY',
  'COOKIE_SECRET',
  'ACTIVATION_SECRET',
  'CRYPTO_SECRET',
  'HMAC_SECRET',
  'EMAIL_CHANGE_SECRET',

  // Tokens
  'ACCESS_TOKEN',
  'REFRESH_TOKEN',
  'PROTECT_TOKEN',

  // Client URLs
  'WEB_CLIENT_URL',
  'ADMIN_CLIENT_URL',
  'AGENT_CLIENT_URL',

  // RP (Relying Party)
  'RP_NAME',
  'RP_ID',
];

function validateEnv(env: ProcessEnv) {
  const missing = requiredVars.filter(
    (key) => !env[key] || env[key].trim() === '',
  );
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const env = process.env as unknown as ProcessEnv;
validateEnv(env);

const defaults: Partial<ProcessEnv> = {
  NODE_ENV: 'development',
  PORT: '8080',
};

const config: ProcessEnv & { ISPRODUCTION: boolean; DB: string } = {
  ...defaults,
  ...env,
  ISPRODUCTION: env.NODE_ENV === 'production',
  DB:
    env.NODE_ENV === 'production'
      ? env.DATABASE_ONLINE.replace(
          '<db_password>',
          env.DATABASE_PASSWORD_ONLINE,
        )
      : env.DATABASE_ONLINE.replace(
          '<db_password>',
          env.DATABASE_PASSWORD_ONLINE,
        ),
};

export { config };
