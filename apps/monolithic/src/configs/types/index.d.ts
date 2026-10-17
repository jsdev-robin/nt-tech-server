export interface ProcessEnv {
  // Server
  NODE_ENV: 'development' | 'production';
  DOMAIN: string;
  PORT: string;

  // Database
  DATABASE_ONLINE: string;
  DATABASE_PASSWORD_ONLINE: string;

  // Redis / Upstash
  NODE_REDIS_URL: string;
  NODE_REDIS_PORT: string;
  REDIS_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;

  // IP Request
  IPINFO_KEY: string;

  // Client URL
  WEB_CLIENT_URL: string;
  ADMIN_CLIENT_URL: string;
  AGENT_CLIENT_URL: string;

  // Passkeys
  RP_NAME: string;
  RP_ID: string;

  // Secrets & Encryption
  EMAIL_CHANGE_SECRET: string;
  COOKIE_SECRET: string;
  ACTIVATION_SECRET: string;
  CRYPTO_SECRET: string;
  HMAC_SECRET: string;
  ACCESS_TOKEN: string;
  REFRESH_TOKEN: string;
  PROTECT_TOKEN: string;
}
