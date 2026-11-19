import { config } from 'dotenv';

// The end-to-end run has its own database and its own ports. It never touches the development database
// (qb) or the development servers (4000 / 5173 / 5174).
config({ path: '../../.env', quiet: true });

export const API_PORT = 14001;
export const WEB_PORT = 15174;
export const E2E_DB = 'qb_e2e';

/** DATABASE_URL (dev server credentials) pointed at the end-to-end database. */
export function e2eDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set (copy .env.example to .env)');
  const url = new URL(base);
  url.pathname = `/${E2E_DB}`;
  return url.toString();
}

export const apiEnv = () => ({
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  DATABASE_URL: e2eDatabaseUrl(),
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789-0123456789',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-9876543210-9876543210',
  ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
  COOKIE_SECURE: 'false',
  LOG_LEVEL: 'warn',
  // Every test signs in from the same address; the limits are not what is under test here.
  RATE_LIMIT_LOGIN_PER_MIN: '1000',
  RATE_LIMIT_LOGIN_IP_PER_MIN: '1000',
  RATE_LIMIT_AUTH_PER_MIN: '1000',
  RATE_LIMIT_API_PER_MIN: '10000',
  RATE_LIMIT_OTHER_PER_MIN: '10000',
});
