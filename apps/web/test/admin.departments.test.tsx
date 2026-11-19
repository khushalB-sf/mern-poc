import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const handlers = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/admin/clients': {
    body: {
      items: [
        { id: 'c1', name: 'Acme', description: 'Key account', userCount: 3 },
        { id: 'c2', name: 'Globex', description: null, userCount: 1 },
      ],
    },
  },
};

/** The same Add button as every admin page: it opens a dialog. */
async function openAdd() {
  await userEvent.click(await screen.findByRole('button', { name: 'Add department' }));
  return screen.findByRole('dialog', { name: 'Add department' });
}

describe('admin departments page', () => {
  it('blocks non-admins', async () => {
    mockApi(baseHandlers);
    renderApp('/admin/departments');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add department' })).toBeNull();
  });

  it('lists departments with user counts', async () => {
    mockApi(handlers);
    renderApp('/admin/departments');
    const table = await screen.findByRole('table', { name: /Departments, their description/ });
    const acme = within(table).getByRole('row', { name: /Acme/ });
    expect(within(acme).getByText('Key account')).toBeInTheDocument();
    expect(within(acme).getByRole('cell', { name: '3' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Globex/ })).toHaveTextContent('1');
    expect(screen.getByText('2 departments')).toBeInTheDocument();
  });

  it('searches by name or description, and filters by whether anyone has access', async () => {
    mockApi({
      ...handlers,
      'GET /api/admin/clients': {
        body: {
          items: [
            { id: 'c1', name: 'Acme', description: 'Key account', userCount: 3 },
            { id: 'c2', name: 'Globex', description: null, userCount: 1 },
            { id: 'c3', name: 'Initech', description: 'TPS reports', userCount: 0 },
          ],
        },
      },
    });
    renderApp('/admin/departments');
    const table = await screen.findByRole('table', { name: /Departments, their description/ });
    const rowsOf = () => within(table).getAllByRole('row').length - 1;
    expect(rowsOf()).toBe(3);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search departments' }), 'tps');
    expect(rowsOf()).toBe(1); // matches Initech's description
    expect(screen.getByText('1 of 3 departments')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(rowsOf()).toBe(3);

    await userEvent.selectOptions(screen.getByLabelText('Users'), 'none');
    expect(within(table).getByRole('row', { name: /Initech/ })).toBeInTheDocument();
    expect(rowsOf()).toBe(1);
    await userEvent.selectOptions(screen.getByLabelText('Users'), 'with');
    expect(rowsOf()).toBe(2);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search departments' }), 'zzz');
    expect(await screen.findByText('No departments match')).toBeInTheDocument();
  });

  it('adds a department with an optional description (blank is sent as null)', async () => {
    const calls = mockApi({
      ...handlers,
      'POST /api/admin/clients': {
        status: 201,
        body: { client: { id: 'c3', name: 'Initech', description: 'TPS', userCount: 0 } },
      },
    });
    renderApp('/admin/departments');
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Initech');
    await userEvent.type(within(dialog).getByLabelText('Description'), '  TPS  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }));
    await screen.findByText('Added department Initech');
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      name: 'Initech',
      description: 'TPS',
    });
  });

  it('rejects a description over 500 characters without a request', async () => {
    const calls = mockApi(handlers);
    renderApp('/admin/departments');
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Initech');
    await userEvent.click(within(dialog).getByLabelText('Description'));
    await userEvent.paste('x'.repeat(501));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }));
    expect(await screen.findByText('Use 500 characters or fewer')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('edits a department: PATCH only what changed, and clearing the description sends null', async () => {
    const calls = mockApi({
      ...handlers,
      'PATCH /api/admin/clients/c1': {
        body: { client: { id: 'c1', name: 'Acme', description: null, userCount: 3 } },
      },
    });
    renderApp('/admin/departments');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Acme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Acme' });
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Key account');
    await userEvent.clear(within(dialog).getByLabelText('Description'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved Acme');
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: '/api/admin/clients/c1',
      body: { description: null },
    });
  });

  it('renaming to an existing name shows the duplicate error in the dialog', async () => {
    mockApi({
      ...handlers,
      'PATCH /api/admin/clients/c1': {
        status: 409,
        body: { error: { code: 'DEPARTMENT_EXISTS', message: 'x' } },
      },
    });
    renderApp('/admin/departments');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Acme' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Globex');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('A department with this name already exists'),
    ).toBeInTheDocument();
  });

  it('delete asks first and says its questions are hidden; confirm sends DELETE', async () => {
    const calls = mockApi({ ...handlers, 'DELETE /api/admin/clients/c2': { status: 204 } });
    renderApp('/admin/departments');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Globex' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete Globex?' });
    expect(within(dialog).getByText(/questions will be hidden/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Globex' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete Globex?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete department' }));
    expect(await screen.findByText('Deleted department Globex')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')!.path).toBe('/api/admin/clients/c2');
  });

  it('adds a department with the trimmed name', async () => {
    const calls = mockApi({
      ...handlers,
      'POST /api/admin/clients': {
        status: 201,
        body: { client: { id: 'c3', name: 'Initech', userCount: 0 } },
      },
    });
    renderApp('/admin/departments');
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText('Name'), '  Initech  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }));
    expect(await screen.findByText('Added department Initech')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ body: { name: 'Initech' } });
  });

  it('shows a field error on a duplicate name (409)', async () => {
    mockApi({
      ...handlers,
      'POST /api/admin/clients': {
        status: 409,
        body: { error: { code: 'DEPARTMENT_EXISTS', message: 'x' } },
      },
    });
    renderApp('/admin/departments');
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Acme');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }));
    expect(
      await within(dialog).findByText('A department with this name already exists'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('blocks a blank name without a request', async () => {
    const calls = mockApi(handlers);
    renderApp('/admin/departments');
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText('Name'), '   ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }));
    expect(await screen.findByText('Enter a department name')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('has no axe violations', async () => {
    mockApi(handlers);
    const { container } = renderApp('/admin/departments');
    await screen.findByRole('table', { name: /Departments, their description/ });
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
