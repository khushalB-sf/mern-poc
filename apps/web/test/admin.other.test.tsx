import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const t = (over: Record<string, unknown>) => ({
  id: 'g1',
  value: 'go',
  label: 'Go',
  archived: false,
  questionCount: 3,
  shared: false,
  ...over,
});
const base = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/admin/clients': {
    body: { items: [{ id: 'c1', name: 'Python', description: null, userCount: 2 }] },
  },
  'GET /api/admin/clients?deleted=true': { body: { items: [] } },
  'GET /api/admin/technologies/other': {
    body: {
      active: [t({})],
      archived: [t({ id: 'g2', value: 'rust', label: 'Rust', archived: true, questionCount: 0 })],
    },
  },
};

describe('"Other" technologies on the Departments page', () => {
  it('lists technologies no department uses, active and archived', async () => {
    mockApi(base);
    renderApp('/admin/departments');
    const list = await screen.findByRole('list', { name: 'Other technologies' });
    expect(list).toHaveTextContent('Go');
    expect(list).toHaveTextContent('3 questions');
    expect(screen.getByRole('list', { name: 'Archived other technologies' })).toHaveTextContent(
      'Rust',
    );
  });

  it('is not shown when every technology belongs to a department', async () => {
    mockApi({
      ...base,
      'GET /api/admin/technologies/other': { body: { active: [], archived: [] } },
    });
    renderApp('/admin/departments');
    await screen.findByRole('list', { name: 'Departments' });
    expect(screen.queryByRole('heading', { name: 'Other technologies' })).toBeNull();
  });

  it('adds one to a department by choosing the department', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/admin/clients/c1/technologies': {
        status: 201,
        body: { technology: { id: 'g1', label: 'Go', created: false } },
      },
    });
    renderApp('/admin/departments');
    const list = await screen.findByRole('list', { name: 'Other technologies' });
    const add = within(list).getByRole('button', { name: 'Add Go to department' });
    expect(add).toBeDisabled();
    await userEvent.selectOptions(within(list).getByLabelText('Department for Go'), 'c1');
    await userEvent.click(add);
    expect(await screen.findByText('Added Go to Python')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/api/admin/clients/c1/technologies',
      body: { label: 'Go' },
    });
  });

  it('archives and restores', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/admin/technologies/g1/archive': { status: 204 },
      'POST /api/admin/technologies/g2/restore': { status: 204 },
    });
    renderApp('/admin/departments');
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Go' }));
    expect(await screen.findByText('Archived Go')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore Rust' }));
    expect(await screen.findByText('Restored Rust')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      '/api/admin/technologies/g1/archive',
      '/api/admin/technologies/g2/restore',
    ]);
  });
});
