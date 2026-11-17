import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const admin = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/questions': { body: { items: [], page: { limit: 20, offset: 0, total: 0 } } },
};

describe('restore: departments', () => {
  const handlers = {
    ...admin,
    'GET /api/admin/clients?deleted=true': {
      body: { items: [{ id: 'c9', name: 'Initech', description: null, userCount: 0 }] },
    },
    'GET /api/admin/clients': {
      body: { items: [{ id: 'c1', name: 'Acme', description: null, userCount: 3 }] },
    },
    'GET /api/admin/clients/c1/impact': { body: { questions: 42, pending: 7, users: 3 } },
  };

  it('the delete dialog says how many questions are hidden', async () => {
    mockApi(handlers);
    renderApp('/admin/departments');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Acme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Acme?' });
    expect(await within(dialog).findByText(/42 questions \(7 awaiting review\)/)).toBeVisible();
    expect(dialog).toHaveTextContent('3 users lose access');
  });

  it('lists deleted departments and restores one', async () => {
    const calls = mockApi({
      ...handlers,
      'POST /api/admin/clients/c9/restore': {
        body: { client: { id: 'c9', name: 'Initech', description: null, userCount: 0 } },
      },
    });
    renderApp('/admin/departments');
    const list = await screen.findByRole('list', { name: 'Deleted departments' });
    expect(list).toHaveTextContent('Initech');
    await userEvent.click(within(list).getByRole('button', { name: 'Restore Initech' }));
    expect(await screen.findByText('Restored department Initech')).toBeInTheDocument();
    expect(
      calls.some((c) => c.method === 'POST' && c.path === '/api/admin/clients/c9/restore'),
    ).toBe(true);
  });
});

describe('technologies', () => {
  const techs = [
    { id: 't1', value: 'react', label: 'React', retired: false, questionCount: 5 },
    { id: 't2', value: 'angular', label: 'Angular', retired: true, questionCount: 2 },
  ];
  const handlers = { ...admin, 'GET /api/admin/technologies': { body: { items: techs } } };

  it('splits in-use from retired, with counts', async () => {
    mockApi(handlers);
    renderApp('/admin/technologies');
    const active = await screen.findByRole('list', { name: 'Technologies' });
    expect(active).toHaveTextContent('React');
    expect(active).toHaveTextContent('5 questions');
    expect(screen.getByRole('list', { name: 'Retired technologies' })).toHaveTextContent('Angular');
  });

  it('retire asks first and says existing questions keep it', async () => {
    const calls = mockApi({
      ...handlers,
      'POST /api/admin/technologies/t1/retire': { status: 204 },
    });
    renderApp('/admin/technologies');
    await userEvent.click(await screen.findByRole('button', { name: 'Retire React' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retire React?' });
    expect(dialog).toHaveTextContent('The 5 questions that use it keep it');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retire technology' }));
    expect(await screen.findByText('Retired React')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.path).toBe('/api/admin/technologies/t1/retire');
  });

  it('restores a retired technology', async () => {
    const calls = mockApi({
      ...handlers,
      'POST /api/admin/technologies/t2/restore': { status: 204 },
    });
    renderApp('/admin/technologies');
    await userEvent.click(await screen.findByRole('button', { name: 'Restore Angular' }));
    expect(await screen.findByText('Restored Angular')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.path).toBe('/api/admin/technologies/t2/restore');
  });

  it('blocks non-admins', async () => {
    mockApi(baseHandlers);
    renderApp('/admin/technologies');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });
});

describe('deleted questions', () => {
  const items = [
    {
      id: 'q1',
      text: 'What is a closure?',
      status: 'APPROVED',
      deletedAt: '2026-11-10T10:00:00Z',
      author: { id: 'u1', name: 'Alice Author' },
      department: { id: 'c1', name: 'Acme' },
      departmentDeleted: false,
    },
    {
      id: 'q2',
      text: 'Explain Kafka partitions',
      status: 'PENDING',
      deletedAt: '2026-11-09T10:00:00Z',
      author: { id: 'u1', name: 'Alice Author' },
      department: { id: 'c9', name: 'Initech' },
      departmentDeleted: true,
    },
  ];

  it('restores a question; one in a deleted department is disabled with the reason', async () => {
    const calls = mockApi({
      ...admin,
      'GET /api/admin/deleted-questions': { body: { items } },
      'POST /api/admin/questions/q1/restore': { status: 204 },
    });
    renderApp('/admin/deleted-questions');
    const list = await screen.findByRole('list', { name: 'Deleted questions' });
    expect(list).toHaveTextContent('Restore Initech first');
    expect(
      within(list).getByRole('button', { name: 'Restore question: Explain Kafka partitions' }),
    ).toBeDisabled();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Restore question: What is a closure?' }),
    );
    expect(await screen.findByText('Question restored')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.path).toBe('/api/admin/questions/q1/restore');
  });

  it('has no axe violations', async () => {
    mockApi({ ...admin, 'GET /api/admin/deleted-questions': { body: { items } } });
    const { container } = renderApp('/admin/deleted-questions');
    await screen.findByRole('list', { name: 'Deleted questions' });
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('shows an empty state', async () => {
    mockApi({ ...admin, 'GET /api/admin/deleted-questions': { body: { items: [] } } });
    renderApp('/admin/deleted-questions');
    expect(await screen.findByText('Nothing deleted')).toBeInTheDocument();
  });
});
