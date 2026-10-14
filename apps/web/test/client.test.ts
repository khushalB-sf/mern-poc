import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '../src/shared/api/client';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.restoreAllMocks());

describe('apiFetch', () => {
  it('sends cookies same-origin, JSON bodies, and never an Authorization header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }));
    await apiFetch('/questions', { method: 'POST', body: { text: 'x' } });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/questions');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: '{"text":"x"}',
    });
    expect(JSON.stringify(init)).not.toMatch(/authorization/i);
  });

  it('maps API errors to ApiError with status, code, message and details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(409, { error: { code: 'DUPLICATE_SUSPECTED', message: 'dup', matches: [{ id: 'a' }] } }),
    );
    const err: unknown = await apiFetch('/questions', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'DUPLICATE_SUSPECTED', message: 'dup' });
    expect((err as ApiError).details.matches).toEqual([{ id: 'a' }]);
  });

  it('survives a non-JSON error body (e.g. a proxy page)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    );
    const err = await apiFetch('/tags').catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('returns undefined for 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch('/auth/logout', { method: 'POST' })).toBeUndefined();
  });

  it('on 401 refreshes the session once and retries the request', async () => {
    let first = true;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return new Response(null, { status: 204 });
      if (first) {
        first = false;
        return json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
      }
      return json(200, { items: [] });
    });
    expect(await apiFetch('/clients')).toEqual({ items: [] });
    expect(spy.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/clients',
      '/api/auth/refresh',
      '/api/clients',
    ]);
  });

  it('shares ONE refresh between concurrent 401s (a second refresh would replay a spent token)', async () => {
    const seen = new Set<string>();
    const refreshes: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshes.push(url);
        await new Promise((r) => setTimeout(r, 20));
        return new Response(null, { status: 204 });
      }
      if (!seen.has(url)) {
        seen.add(url);
        return json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
      }
      return json(200, { ok: url });
    });
    const results = await Promise.all([
      apiFetch('/tags'),
      apiFetch('/clients'),
      apiFetch('/questions'),
    ]);
    expect(results).toHaveLength(3);
    expect(refreshes).toHaveLength(1);
  });

  it('gives up with a 401 when the refresh fails, without retrying forever', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input) === '/api/auth/refresh'
          ? json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } })
          : json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } }),
      );
    const err = await apiFetch('/tags').catch((e) => e);
    expect(err).toMatchObject({ status: 401 });
    expect(spy).toHaveBeenCalledTimes(2); // original + one refresh attempt
  });

  it('never tries to refresh for /auth/* calls (a wrong password is not an expired session)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'bad' } }));
    await apiFetch('/auth/login', { method: 'POST', body: {} }).catch(() => {});
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
