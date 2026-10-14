/**
 * Thin fetch wrapper. Authentication lives entirely in httpOnly cookies the browser manages, so
 * this code never sees or stores a token. On a 401 it refreshes the session once and retries.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshing: Promise<boolean> | null = null;

/**
 * Single-flight: concurrent 401s share one refresh request. Refresh tokens rotate and a replayed
 * token revokes the session, so two parallel refreshes would log the user out. The Web Lock extends
 * the same guarantee across browser tabs, which share the cookie.
 */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const run = async () => {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      return res.ok;
    };
    try {
      return navigator.locks ? await navigator.locks.request('qb-refresh', run) : await run();
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal | undefined;
  /** Internal: set on the retry so a second 401 cannot loop. */
  retried?: boolean;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, retried = false } = opts;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    signal: signal ?? null,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });

  const isAuthCall = path.startsWith('/auth/');
  if (res.status === 401 && !retried && !isAuthCall && (await refreshSession())) {
    return apiFetch<T>(path, { ...opts, retried: true });
  }

  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  let error: { code?: string; message?: string; [k: string]: unknown } = {};
  try {
    error = ((await res.json()) as { error?: typeof error }).error ?? {};
  } catch {
    // non-JSON error body (e.g. a proxy error page): fall through to the generic message
  }
  const { code, message, ...details } = error;
  throw new ApiError(
    res.status,
    code ?? 'UNKNOWN',
    message ?? `Request failed (${res.status})`,
    details,
  );
}
