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

export const login = (email: string, password: string) =>
  apiFetch<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } }).then(
    (r) => r.user,
  );

export const logout = () => apiFetch<void>('/auth/logout', { method: 'POST' });
