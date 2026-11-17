/**
 * Red-team tests for the browser side: hostile data from the API must be rendered as text, never as
 * markup, and no navigation or storage trick may leak a session.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, question, renderApp } from './helpers';

const PAYLOADS = [
  '<img src=x onerror="window.__pwned=1">',
  '<script>window.__pwned=1</script>',
  '"><svg/onload=window.__pwned=1>',
  '<a href="javascript:window.__pwned=1">click</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
];
const evil = PAYLOADS.join(' ');

/** Nothing the payloads would create exists in the DOM, and nothing is a script URL. */
function expectNoInjectedMarkup() {
  const root = document.body;
  expect(root.querySelector('img[src="x"]')).toBeNull();
  expect(root.querySelector('svg[onload]')).toBeNull();
  expect(root.querySelector('iframe')).toBeNull();
  expect(root.querySelector('[onerror],[onload]')).toBeNull();
  expect(
    [...root.querySelectorAll('script')].filter((s) => s.textContent?.includes('__pwned')),
  ).toEqual([]);
  for (const a of root.querySelectorAll('a[href]')) {
    expect(a.getAttribute('href')).not.toMatch(/^\s*javascript:/i);
  }
  expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
}

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;

describe('XSS: hostile data is shown as text', () => {
  it('question list: text, department and tags', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions': {
        body: page([
          question({
            text: evil,
            client: { id: 'c1', name: evil },
            author: { id: 'u9', name: evil },
          }),
        ]),
      },
    });
    renderApp('/');
    await screen.findByRole('link', {
      name: new RegExp(PAYLOADS[1]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
    expectNoInjectedMarkup();
  });

  it('question detail: text, answer notes, review note and history actors', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions/q1': {
        body: {
          question: question({
            text: evil,
            answerNotes: evil,
            status: 'REJECTED',
            review: {
              decision: 'REJECTED',
              note: evil,
              reviewer: { id: 'r', name: evil },
              at: '2026-01-03T10:00:00.000Z',
            },
          }),
        },
      },
      'GET /api/questions/q1/history': {
        body: {
          items: [
            {
              id: 'h1',
              type: 'QUESTION_CREATED',
              at: '2026-01-02T10:00:00.000Z',
              actor: { id: 'u', name: evil },
            },
            {
              id: 'h2',
              type: 'QUESTION_APPROVED',
              at: '2026-01-03T10:00:00.000Z',
              actor: { id: 'r', name: evil },
              note: evil,
            },
            {
              id: 'h3',
              type: 'QUESTION_UPDATED',
              at: '2026-01-04T10:00:00.000Z',
              actor: { id: 'u', name: 'x' },
              changes: { text: { from: evil, to: evil } },
            },
          ],
        },
      },
    });
    renderApp('/questions/q1');
    await screen.findByRole('heading', { level: 1 });
    expect(document.body.textContent).toContain('<script>window.__pwned=1</script>'); // visible as plain text
    expectNoInjectedMarkup();
  });

  const adminHandlers = {
    ...baseHandlers,
    'GET /api/auth/me': { body: { user: adminUser } },
    'GET /api/admin/users': {
      body: {
        items: [
          {
            id: 'u2',
            email: 'e@x.dev',
            name: evil,
            role: 'USER',
            active: true,
            clients: [{ id: 'c1', name: evil }],
          },
        ],
      },
    },
    'GET /api/admin/clients': {
      body: { items: [{ id: 'c1', name: evil, description: evil, userCount: 1 }] },
    },
    'GET /api/admin/clients?deleted=true': {
      body: { items: [{ id: 'c2', name: evil, description: evil, userCount: 0 }] },
    },
    'GET /api/admin/clients/c1/technologies': {
      body: {
        active: [
          { id: 't1', value: 'x', label: evil, archived: false, questionCount: 1, shared: false },
        ],
        archived: [
          { id: 't2', value: 'y', label: evil, archived: true, questionCount: 0, shared: false },
        ],
        available: [{ id: 't3', label: evil }],
      },
    },
    'GET /api/admin/technologies/other': {
      body: {
        active: [
          { id: 't9', value: 'z', label: evil, archived: false, questionCount: 0, shared: false },
        ],
        archived: [],
      },
    },
    'GET /api/admin/deleted-questions': {
      body: {
        items: [
          {
            id: 'q1',
            text: evil,
            status: 'APPROVED',
            deletedAt: '2026-01-01T00:00:00Z',
            author: { id: 'u', name: evil },
            department: { id: 'c', name: evil },
            departmentDeleted: false,
          },
        ],
      },
    },
    'GET /api/questions': { body: page([]) },
  };

  it('admin users page: names and department names', async () => {
    mockApi(adminHandlers);
    renderApp('/admin/users');
    await screen.findByRole('table');
    expectNoInjectedMarkup();
  });

  it('admin departments page: names, descriptions, deleted list, Other group and the edit dialog technologies', async () => {
    mockApi(adminHandlers);
    renderApp('/admin/departments');
    await screen.findByRole('list', { name: 'Other technologies' });
    await userEvent.click((await screen.findAllByRole('button', { name: /^Edit / }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('list', { name: /Technologies of/ });
    expectNoInjectedMarkup();
  });

  it('admin deleted questions page', async () => {
    mockApi(adminHandlers);
    renderApp('/admin/deleted-questions');
    await screen.findByRole('list', { name: 'Deleted questions' });
    expectNoInjectedMarkup();
  });

  it('the question form echoes a hostile value into fields, not the DOM', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions/q1': { body: { question: question({ text: evil, answerNotes: evil }) } },
    });
    renderApp('/questions/q1/edit');
    const field = await screen.findByLabelText('Question');
    expect(field).toHaveValue(evil);
    expectNoInjectedMarkup();
  });
});

describe('session and navigation safety', () => {
  it('a ?from= / returnTo style parameter on /login cannot redirect off site after sign-in', async () => {
    mockApi({
      'GET /api/auth/me': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'x' } },
      },
      'POST /api/auth/login': {
        body: { user: { id: 'u1', email: 'a@x.dev', name: 'A', role: 'AUTHOR' } },
      },
      'GET /api/questions': { body: page([]) },
      'GET /api/tags': { body: { categories: [] } },
      'GET /api/clients': { body: { items: [] } },
    });
    const { router } = renderApp(
      '/login?from=https://evil.example&redirect=//evil.example&next=/admin/users',
    );
    await userEvent.type(await screen.findByLabelText('Email'), 'a@x.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Questions' });
    expect(router.state.location.pathname).toBe('/');
    expect(window.location.hostname).not.toBe('evil.example');
  });

  it('tokens never live in web storage: signing in writes nothing to localStorage or sessionStorage', async () => {
    mockApi({
      'GET /api/auth/me': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'x' } },
      },
      'POST /api/auth/login': {
        body: { user: { id: 'u1', email: 'a@x.dev', name: 'A', role: 'AUTHOR' } },
      },
      'GET /api/questions': { body: page([]) },
      'GET /api/tags': { body: { categories: [] } },
      'GET /api/clients': { body: { items: [] } },
    });
    localStorage.clear();
    sessionStorage.clear();
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@x.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Questions' });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toMatch(/token/i);
  });

  it('the password field is masked by default and the login form disables autofill leaks', async () => {
    mockApi({
      'GET /api/auth/me': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'x' } },
      },
    });
    renderApp('/login');
    const pw = await screen.findByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    expect(pw).toHaveAttribute('autocomplete', 'current-password');
  });
});
