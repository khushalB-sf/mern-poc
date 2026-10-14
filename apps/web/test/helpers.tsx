import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '../src/app/queryClient';
import { routes } from '../src/app/routes';
import { ToastProvider } from '../src/shared/ui/Toast';

type Handler = (req: {
  url: URL;
  body: unknown;
}) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;
export type Handlers = Record<string, Handler | { status?: number; body?: unknown }>;

export const USER = { id: 'u1', email: 'a@x.dev', name: 'Alice Author', role: 'AUTHOR' } as const;
export const CATEGORIES = [
  {
    slug: 'technology',
    name: 'Technology',
    tags: [
      { value: 'react', label: 'React' },
      { value: 'nodejs', label: 'Node.js' },
    ],
  },
  {
    slug: 'seniority',
    name: 'Seniority level',
    tags: [
      { value: 'mid', label: 'Mid' },
      { value: 'senior', label: 'Senior' },
    ],
  },
];
export const question = (over: Record<string, unknown> = {}) => ({
  id: 'q1',
  text: 'How would you design a rate limiter?',
  answerNotes: 'Token bucket.',
  client: null,
  tags: [{ category: 'technology', value: 'nodejs' }],
  author: { id: 'u1', name: 'Alice Author' },
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
  ...over,
});
export const page = (items: unknown[], total = items.length) => ({
  items,
  page: { limit: 20, offset: 0, total },
});

/** Routes fetch("/api/...") by "METHOD /path" (query string ignored unless the key includes it). */
export function mockApi(handlers: Handlers) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const h =
      handlers[`${method} ${url.pathname}${url.search}`] ?? handlers[`${method} ${url.pathname}`];
    if (!h)
      return new Response(
        JSON.stringify({
          error: { code: 'NOT_FOUND', message: `unmocked ${method} ${url.pathname}` },
        }),
        { status: 404 },
      );
    const res = typeof h === 'function' ? await h({ url, body }) : h;
    const status = res.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(res.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return calls;
}

export function renderApp(initialPath: string, customRoutes: RouteObject[] = routes) {
  const router = createMemoryRouter(customRoutes, { initialEntries: [initialPath] });
  const client = createQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { router, client, ...utils };
}

export const signedIn = { 'GET /api/auth/me': { body: { user: USER } } };
export const baseHandlers: Handlers = {
  ...signedIn,
  'GET /api/tags': { body: { categories: CATEGORIES } },
  'GET /api/clients': { body: { items: [{ id: 'c1', name: 'Acme' }] } },
};
