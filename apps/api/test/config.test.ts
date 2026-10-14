import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { testEnv } from './helpers.js';

describe('loadConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const c = loadConfig(testEnv);
    expect(c.PORT).toBe(4000);
    expect(c.COOKIE_SECURE).toBe(false);
    expect(c.ALLOWED_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('splits ALLOWED_ORIGINS', () => {
    const c = loadConfig({ ...testEnv, ALLOWED_ORIGINS: 'http://a.test, http://b.test' });
    expect(c.ALLOWED_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({ ...testEnv, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects short secrets without echoing the value', () => {
    const secret = 'too-short-secret';
    try {
      loadConfig({ ...testEnv, JWT_ACCESS_SECRET: secret });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/JWT_ACCESS_SECRET/);
      expect(msg).not.toContain(secret);
    }
  });

  it('rejects identical access and refresh secrets', () => {
    expect(() => loadConfig({ ...testEnv, JWT_REFRESH_SECRET: testEnv.JWT_ACCESS_SECRET })).toThrow(
      /must differ/,
    );
  });

  it('refuses the dev-only placeholder secrets when COOKIE_SECURE=true', () => {
    const env = { ...testEnv, JWT_ACCESS_SECRET: 'dev-only-' + 'a'.repeat(30) };
    expect(() => loadConfig({ ...env, COOKIE_SECURE: 'true' })).toThrow(/dev-only/);
    expect(() => loadConfig({ ...env, COOKIE_SECURE: 'false' })).not.toThrow();
  });
});
