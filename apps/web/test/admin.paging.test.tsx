import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_OFFSET, PAGE_SIZE } from '../src/features/questions/filters';
import { Pagination } from '../src/features/questions/components/Pagination';
import { baseHandlers, mockApi, page, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const user = (i: number) => ({
  id: `u${i}`,
  email: `u${i}@x.dev`,
  name: `User ${i}`,
  role: 'USER',
  active: true,
  clients: [],
});
const base = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/admin/clients': { body: { items: [] } },
  'GET /api/admin/users?deleted=true': { body: { items: [], nextCursor: null } },
  'GET /api/questions': { body: page([]) },
};

describe('admin users: search and load more', () => {
  it('loads the next page with the cursor', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/admin/users': { body: { items: [user(1), user(2)], nextCursor: 'C1' } },
      'GET /api/admin/users?cursor=C1': { body: { items: [user(3)], nextCursor: null } },
    });
    renderApp('/admin/users');
    const table = await screen.findByRole('table', { name: /Users, their role/ });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await within(table).findByText('User 3');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(calls.some((c) => c.path === '/api/admin/users?cursor=C1')).toBe(true);
  });

  it('searches by name or email and starts again from the first page', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/admin/users': { body: { items: [user(1), user(2)], nextCursor: null } },
      'GET /api/admin/users?q=ada': {
        body: { items: [{ ...adminUser, active: true, clients: [] }], nextCursor: null },
      },
    });
    renderApp('/admin/users');
    await screen.findByRole('table', { name: /Users, their role/ });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'ada{Enter}');
    await screen.findByText('ada@x.dev');
    expect(calls.some((c) => c.path === '/api/admin/users?q=ada')).toBe(true);
    expect(screen.queryByText('User 1')).toBeNull();
  });

  it('says so when nobody matches', async () => {
    mockApi({
      ...base,
      'GET /api/admin/users': { body: { items: [user(1)], nextCursor: null } },
      'GET /api/admin/users?q=zzz': { body: { items: [], nextCursor: null } },
    });
    renderApp('/admin/users');
    await screen.findByRole('table', { name: /Users, their role/ });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'zzz{Enter}');
    expect(await screen.findByText('No users match')).toBeInTheDocument();
  });
});

describe('deleted questions: load more', () => {
  const q = (i: number) => ({
    id: `q${i}`,
    text: `Question ${i}`,
    status: 'APPROVED',
    deletedAt: '2026-01-01T00:00:00Z',
    author: { id: 'u', name: 'A' },
    department: null,
    departmentDeleted: false,
  });
  it('pages with the cursor', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/admin/deleted-questions': { body: { items: [q(1)], nextCursor: 'C1' } },
      'GET /api/admin/deleted-questions?cursor=C1': { body: { items: [q(2)], nextCursor: null } },
    });
    renderApp('/admin/deleted-questions');
    await screen.findByText('Question 1');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Question 2');
    expect(calls.some((c) => c.path === '/api/admin/deleted-questions?cursor=C1')).toBe(true);
  });
});

describe('question list pagination stops where the API does', () => {
  it('a result set deeper than the limit says so, and Next stops at the last reachable page', () => {
    const onPage = vi.fn();
    const lastReachable = Math.floor(MAX_OFFSET / PAGE_SIZE) + 1;
    render(<Pagination page={lastReachable} pageSize={PAGE_SIZE} total={50_000} onPage={onPage} />);
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(screen.getByText(/Narrow your search to see the rest/)).toBeInTheDocument();
    expect(screen.getByText(/of 50,000/)).toBeInTheDocument();
  });

  it('a normal result set is unchanged, with no warning', () => {
    render(<Pagination page={1} pageSize={PAGE_SIZE} total={95} onPage={() => {}} />);
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
    expect(screen.queryByText(/Narrow your search/)).toBeNull();
  });
});
