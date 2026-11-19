import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp, USER } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const acme = { id: 'c1', name: 'Acme' };
const globex = { id: 'c2', name: 'Globex' };
const rows = [
  { ...adminUser, active: true, clients: [] },
  {
    id: 'u1',
    email: 'a@x.dev',
    name: 'Alice Author',
    role: 'AUTHOR',
    active: true,
    clients: [acme],
  },
  { id: 'u2', email: 'u@x.dev', name: 'Una User', role: 'USER', active: true, clients: [] },
];
const handlers = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/admin/users': { body: { items: rows } },
  'GET /api/admin/clients': {
    body: {
      items: [
        { ...acme, userCount: 1 },
        { ...globex, userCount: 0 },
      ],
    },
  },
  'GET /api/questions': { body: { items: [], page: { limit: 20, offset: 0, total: 0 } } },
};

describe('admin users page', () => {
  it('blocks non-admins and shows no admin links', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': handlers['GET /api/questions'] });
    renderApp('/admin/users');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Departments' })).toBeNull();
    expect(USER.role).toBe('AUTHOR');
  });

  it('shows admins the header links', async () => {
    mockApi(handlers);
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: 'Departments' })).toHaveAttribute(
      'href',
      '/admin/departments',
    );
  });

  it('lists users; own role select is disabled', async () => {
    mockApi(handlers);
    renderApp('/admin/users');
    const table = await screen.findByRole('table', { name: /Users, their role/ });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByLabelText('Role for Ada Admin')).toBeDisabled();
    expect(screen.getByLabelText('Role for Alice Author')).toBeEnabled();
    expect(screen.getByText("You can't change your own role.")).toBeInTheDocument();
  });

  it('changing a role sends PATCH and confirms with a toast', async () => {
    const calls = mockApi({
      ...handlers,
      'PATCH /api/admin/users/u2': { body: { user: { ...rows[2], role: 'AUTHOR' } } },
    });
    renderApp('/admin/users');
    await userEvent.selectOptions(await screen.findByLabelText('Role for Una User'), 'AUTHOR');
    expect(await screen.findByText('Una User is now Author')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: '/api/admin/users/u2',
      body: { role: 'AUTHOR' },
    });
  });

  it('shows the API error when a role change fails', async () => {
    mockApi({
      ...handlers,
      'PATCH /api/admin/users/u2': {
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'You are not allowed to do this' } },
      },
    });
    renderApp('/admin/users');
    await userEvent.selectOptions(await screen.findByLabelText('Role for Una User'), 'REVIEWER');
    expect(await screen.findByText('You are not allowed to do this')).toBeInTheDocument();
  });

  it('editing only the departments sends just the PUT', async () => {
    const calls = mockApi({
      ...handlers,
      'PUT /api/admin/users/u1/clients': { body: { user: { ...rows[1], clients: [globex] } } },
    });
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Alice Author' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByLabelText('Acme')).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText('Acme'));
    await userEvent.click(within(dialog).getByLabelText('Globex'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved Alice Author')).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([
      { method: 'PUT', path: '/api/admin/users/u1/clients', body: { clientIds: ['c2'] } },
    ]);
  });

  it('edit sends only the changed fields and never a blank password', async () => {
    const calls = mockApi({
      ...handlers,
      'PATCH /api/admin/users/u1': { body: { user: { ...rows[1], name: 'Alice B' } } },
    });
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Alice Author' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Alice B');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved Alice B');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([
      { method: 'PATCH', path: '/api/admin/users/u1', body: { name: 'Alice B' } },
    ]);
  });

  it('edit can deactivate and set a new password (min 8 characters enforced locally)', async () => {
    const calls = mockApi({
      ...handlers,
      'PATCH /api/admin/users/u2': { body: { user: { ...rows[2], active: false } } },
    });
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Una User' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('New password'), 'short');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);

    await userEvent.clear(within(dialog).getByLabelText('New password'));
    await userEvent.type(within(dialog).getByLabelText('New password'), 'long-enough-1');
    await userEvent.click(within(dialog).getByLabelText('Active (can sign in)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved Una User');
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      active: false,
      password: 'long-enough-1',
    });
  });

  it("on your own row the account can't be deactivated or deleted", async () => {
    mockApi(handlers);
    renderApp('/admin/users');
    await screen.findByRole('table', { name: /Users, their role/ });
    expect(screen.queryByRole('button', { name: 'Delete Ada Admin' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete Alice Author' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Ada Admin' }));
    expect(await screen.findByLabelText('Active (can sign in)')).toBeDisabled();
  });

  it('adds a user: POST with role and departments; 409 shows an email field error', async () => {
    let status = 409;
    const calls = mockApi({
      ...handlers,
      'POST /api/admin/users': () =>
        status === 409
          ? { status, body: { error: { code: 'EMAIL_EXISTS', message: 'x' } } }
          : {
              status: 201,
              body: {
                user: {
                  id: 'u9',
                  email: 'r@x.dev',
                  name: 'Ria Reviewer',
                  role: 'REVIEWER',
                  active: true,
                  clients: [acme],
                },
              },
            },
    });
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Ria Reviewer');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'r@x.dev');
    await userEvent.type(within(dialog).getByLabelText('Password'), 'Passw0rd!1');
    await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'REVIEWER');
    await userEvent.click(await within(dialog).findByLabelText('Acme'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(
      await within(dialog).findByText(/Another user already has this email/),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');

    status = 201;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText('Added Ria Reviewer')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').at(-1)!.body).toEqual({
      name: 'Ria Reviewer',
      email: 'r@x.dev',
      password: 'Passw0rd!1',
      role: 'REVIEWER',
      clientIds: ['c1'],
    });
  });

  it('adding needs a name, a valid email and an 8+ character password, with no request', async () => {
    const calls = mockApi(handlers);
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'nope');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument();
    expect(within(dialog).getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('delete asks first: cancel does nothing, confirm sends DELETE', async () => {
    const calls = mockApi({
      ...handlers,
      'DELETE /api/admin/users/u2': { status: 204 },
    });
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Una User' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete Una User?' });
    expect(within(dialog).getByText(/history are kept/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Una User' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete Una User?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    expect(await screen.findByText('Deleted Una User')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')!.path).toBe('/api/admin/users/u2');
  });

  it('shows the API reason when a delete is refused', async () => {
    mockApi({
      ...handlers,
      'DELETE /api/admin/users/u2': {
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'You are not allowed to do this' } },
      },
    });
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Una User' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('not allowed');
  });

  it('the add dialog has no axe violations', async () => {
    mockApi(handlers);
    renderApp('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByLabelText('Acme');
    const result = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  it('filters by role, status and department on the server, and clears them again', async () => {
    const calls = mockApi(handlers);
    renderApp('/admin/users');
    await screen.findByRole('table', { name: /Users, their role/ });
    const lastUsersCall = () =>
      calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/admin/users')).at(-1)!.path;

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'REVIEWER');
    await waitFor(() => expect(lastUsersCall()).toContain('role=REVIEWER'));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'false');
    await waitFor(() => expect(lastUsersCall()).toContain('active=false'));
    await userEvent.selectOptions(screen.getByLabelText('Department'), 'c1');
    await waitFor(() => expect(lastUsersCall()).toContain('clientId=c1'));
    await waitFor(() => expect(lastUsersCall()).toContain('role=REVIEWER'));

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastUsersCall()).toBe('/api/admin/users'));
    expect(screen.getByLabelText('Role')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('shows each account as Active or Deactivated, and a message when a filter matches nobody', async () => {
    mockApi({
      ...handlers,
      'GET /api/admin/users': {
        body: { items: [rows[0], { ...rows[2], active: false }] },
      },
    });
    renderApp('/admin/users');
    const table = await screen.findByRole('table', { name: /Users, their role/ });
    expect(within(table).getByText('Active')).toBeInTheDocument();
    expect(within(table).getByText('Deactivated')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    mockApi(handlers);
    const { container } = renderApp('/admin/users');
    await screen.findByRole('table', { name: /Users, their role/ });
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
