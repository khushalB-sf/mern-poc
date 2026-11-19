import { apiFetch, ApiError } from '../../shared/api/client';
import type { User } from '../../shared/api/types';

/** The current user, or null when signed out. Anything other than "signed out" still throws. */
export async function fetchMe(signal?: AbortSignal): Promise<User | null> {
  try {
    return (await apiFetch<{ user: User }>('/auth/me', { signal })).user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

/** Signed in, or the password was right but a code is still needed (no session yet). */
export type LoginResult = { user: User } | { mfaRequired: true; mfaToken: string };

export const login = (email: string, password: string) =>
  apiFetch<LoginResult>('/auth/login', { method: 'POST', body: { email, password } });

export const mfaVerify = (body: { mfaToken: string; code: string }) =>
  apiFetch<{ user: User }>('/auth/mfa/verify', { method: 'POST', body }).then((r) => r.user);

export const mfaSetup = () =>
  apiFetch<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST' });

export const mfaEnable = (code: string) =>
  apiFetch<{ recoveryCodes: string[] }>('/auth/mfa/enable', { method: 'POST', body: { code } });

export const mfaDisable = (body: { password: string; code: string }) =>
  apiFetch<void>('/auth/mfa/disable', { method: 'POST', body });

export const logout = () => apiFetch<void>('/auth/logout', { method: 'POST' });

export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  apiFetch<void>('/auth/change-password', { method: 'POST', body });

export const resetPassword = (body: { token: string; newPassword: string }) =>
  apiFetch<void>('/auth/reset-password', { method: 'POST', body });
