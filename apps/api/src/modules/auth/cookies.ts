import type { CookieOptions, Response } from 'express';
import type { Config } from '../../config/env.js';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from './tokens.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

// Paths are narrow on purpose: the refresh token is only ever sent to /api/auth/*.
const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/auth';

const base = (config: Config): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.COOKIE_SECURE,
});

export function setAuthCookies(res: Response, config: Config, access: string, refresh: string) {
  res.cookie(ACCESS_COOKIE, access, {
    ...base(config),
    path: ACCESS_PATH,
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refresh, {
    ...base(config),
    path: REFRESH_PATH,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response, config: Config) {
  // Attributes must match those used when setting, or the browser keeps the cookie.
  res.clearCookie(ACCESS_COOKIE, { ...base(config), path: ACCESS_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...base(config), path: REFRESH_PATH });
}
