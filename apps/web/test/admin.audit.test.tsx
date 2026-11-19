import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const ev = (i: number, over: Record<string, unknown> = {}) => ({
  id: `e${i}`,
  type: 'CLIENT_DELETED',
  at: `2026-11-1${i}T10:00:00.000Z`,
  actor: { id: 'a1', name: 'Ada Admin' },
  questionId: null,
  payload: { name: `Dept ${i}`, technologiesArchived: 2 },
  ...over,
});
const base = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/questions': { body: page([]) },
  'GET /api/admin/audit?limit=50': {
    body: {
      items: [ev(1), ev(2, { type: 'USER_CREATED', payload: { email: 'n@x.dev', role: 'USER' } })],
      nextCursor: null,
    },
  },
};

describe('audit log', () => {
  it('is in the admin navigation, and not shown to anyone else', async () => {
    mockApi(base);
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Audit log' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
  });

  it('blocks non-admins', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([]) } });
    renderApp('/admin/audit');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it('lists events newest first in words, with who and the key facts', async () => {
    mockApi(base);
    renderApp('/admin/audit');
    const table = await screen.findByRole('table', { name: /Audit events/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Department deleted');
    expect(rows[0]).toHaveTextContent('Ada Admin');
    expect(rows[0]).toHaveTextContent('Dept 1');
    expect(rows[1]).toHaveTextContent('User created');
    expect(rows[1]).toHaveTextContent('n@x.dev');
  });

  it('loads more with the cursor', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/admin/audit?limit=50': { body: { items: [ev(1)], nextCursor: 'CUR1' } },
      'GET /api/admin/audit?limit=50&cursor=CUR1': { body: { items: [ev(2)], nextCursor: null } },
    });
    renderApp('/admin/audit');
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    const table = await screen.findByRole('table', { name: /Audit events/ });
    await within(table).findAllByText(/Dept 2/);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(calls.some((c) => c.path === '/api/admin/audit?limit=50&cursor=CUR1')).toBe(true);
  });

  it('filters by event type and by dates, and the CSV link carries the same filters', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/admin/audit?limit=50&type=USER_CREATED&from=2026-11-01': {
        body: {
          items: [ev(2, { type: 'USER_CREATED', payload: { email: 'n@x.dev' } })],
          nextCursor: null,
        },
      },
    });
    renderApp('/admin/audit');
    await userEvent.selectOptions(await screen.findByLabelText('Event'), 'USER_CREATED');
    await userEvent.type(screen.getByLabelText('From'), '2026-11-01');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('n@x.dev');
    expect(
      calls.some((c) => c.path === '/api/admin/audit?limit=50&type=USER_CREATED&from=2026-11-01'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/admin/audit/export?type=USER_CREATED&from=2026-11-01',
    );
  });

  it('shows the full detail on request, and an empty state', async () => {
    mockApi(base);
    const first = renderApp('/admin/audit');
    const table = await screen.findByRole('table', { name: /Audit events/ });
    await userEvent.click(within(table).getAllByText('Show details')[0]!);
    expect(within(table).getByText(/"technologiesArchived": 2/)).toBeInTheDocument();
    first.unmount();

    mockApi({
      ...base,
      'GET /api/admin/audit?limit=50': { body: { items: [], nextCursor: null } },
    });
    renderApp('/admin/audit');
    expect(await screen.findByText('No events match')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    mockApi(base);
    const { container } = renderApp('/admin/audit');
    await screen.findByRole('table', { name: /Audit events/ });
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
