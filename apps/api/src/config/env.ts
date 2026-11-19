import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// .env lives at the repo root for local dev; in Docker the variables come from the environment.
loadDotenv({ path: '../../.env', quiet: true });

export const DEFAULT_SEED_PASSWORD = 'Passw0rd!demo';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  // Origins allowed to make state-changing requests (CSRF Origin check, ADR-006).
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  // false by default: Safari drops Secure cookies on http://localhost.
  COOKIE_SECURE: bool.default(false),
  RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().int().min(1).default(5),
  // Per client IP across ALL emails, so rotating the email cannot get around the per-email limit
  // (credential stuffing, and Argon2 is expensive to compute for every guess).
  RATE_LIMIT_LOGIN_IP_PER_MIN: z.coerce.number().int().min(1).default(30),
  // Number of reverse proxies in front of the API whose X-Forwarded-For is trusted (0 = none).
  // Anything above 0 is only safe if clients cannot reach the API port directly.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  // Per authenticated user, across the questions API (search is debounced in the UI, so this is generous).
  RATE_LIMIT_API_PER_MIN: z.coerce.number().int().min(1).default(120),
  // Per authenticated user, shared by everything else behind sign-in: /tags, /clients and /admin/*.
  RATE_LIMIT_OTHER_PER_MIN: z.coerce.number().int().min(1).default(120),
  // Per client IP, for /auth/refresh and /auth/logout (no user is known yet when they are called).
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().min(1).default(30),
  // Serves Swagger UI at /api/docs and the spec at /api/openapi.json (public: it describes the contract only).
  // Default: on except in production, so a deployment does not publish its API contract by accident.
  DOCS_ENABLED: bool.optional(),
  SEED_ON_START: bool.default(false),
  SEED_PASSWORD: z.string().min(8).default(DEFAULT_SEED_PASSWORD),
});

export type Config = Omit<z.infer<typeof schema>, 'DOCS_ENABLED'> & { DOCS_ENABLED: boolean };

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Names and reasons only: never echo values (they may be secrets).
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  // https deployment (Secure cookies) must not run on the committed placeholder secrets.
  const { COOKIE_SECURE, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } = parsed.data;
  if (
    COOKIE_SECURE &&
    [JWT_ACCESS_SECRET, JWT_REFRESH_SECRET].some((s) => s.startsWith('dev-only'))
  ) {
    throw new Error('Replace the dev-only JWT secrets before enabling COOKIE_SECURE');
  }
  // https deployment must not seed demo accounts with the published default password.
  if (
    COOKIE_SECURE &&
    parsed.data.SEED_ON_START &&
    parsed.data.SEED_PASSWORD === DEFAULT_SEED_PASSWORD
  ) {
    throw new Error('Set a custom SEED_PASSWORD before seeding demo accounts with COOKIE_SECURE');
  }
  return {
    ...parsed.data,
    DOCS_ENABLED: parsed.data.DOCS_ENABLED ?? parsed.data.NODE_ENV !== 'production',
  };
}
