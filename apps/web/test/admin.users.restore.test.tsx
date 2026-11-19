import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const acme = { id: 'c1', name: 'Acme' };
const live = [
  { ...adminUser, active: true, clients: [] },
  {
    id: 'u1',
    email: 'a@x.dev',
    name: 'Alice Author',
    role: 'AUTHOR',
    active: true,
    clients: [acme],
  },
];
const gone = {
  id: 'u9',
  email: 'una@x.dev',
  name: 'Una User',
  role: 'AUTHOR',
  active: false,
  clients: [acme],
};
const base = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/admin/users': { body: { items: live } },
  'GET /api/admin/users?deleted=true': { body: { items: [gone] } },
  'GET /api/admin/clients': { body: { items: [{ ...acme, userCount: 1 }] } },
  'GET /api/questions': { body: { items: [], page: { limit: 20, offset: 0, total: 0 } } },
};

describe('deleted users', () => {
  it('lists deleted users and restores one, saying it comes back switched off', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/admin/users/u9/restore': { body: { user: { ...gone } } },
    });
    renderApp('/admin/users');
    const list = await screen.findByRole('list', { name: 'Deleted users' });
    expect(list).toHaveTextContent('Una User');
    expect(list).toHaveTextContent('una@x.dev');
    await userEvent.click(within(list).getByRole('button', { name: 'Restore Una User' }));
    expect(await screen.findByText(/Restored Una User.*switched off/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.path).toBe('/api/admin/users/u9/restore');
  });

  it('shows nothing when nobody is deleted', async () => {
    mockApi({ ...base, 'GET /api/admin/users?deleted=true': { body: { items: [] } } });
    renderApp('/admin/users');
    await screen.findByRole('table');
    expect(screen.queryByRole('list', { name: 'Deleted users' })).toBeNull();
  });

  it('the delete confirmation says the account can be restored', async () => {
    mockApi(base);
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Alice Author' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Alice Author?' });
    expect(dialog).toHaveTextContent(/restore/i);
  });

  it('shows the API reason when the last admin cannot be removed', async () => {
    mockApi({
      ...base,
      'GET /api/admin/users': {
        body: {
          items: [
            ...live,
            {
              id: 'a2',
              email: 'b@x.dev',
              name: 'Bo Admin',
              role: 'ADMIN',
              active: true,
              clients: [],
            },
          ],
        },
      },
      'DELETE /api/admin/users/a2': {
        status: 409,
        body: { error: { code: 'LAST_ADMIN', message: 'There must be at least one active admin' } },
      },
    });
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Bo Admin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Bo Admin?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    expect(
      await within(dialog).findByText('There must be at least one active admin'),
    ).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    mockApi(base);
    const { container } = renderApp('/admin/users');
    await screen.findByRole('list', { name: 'Deleted users' });
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
