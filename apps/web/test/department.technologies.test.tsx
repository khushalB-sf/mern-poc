import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const tech = (over: Record<string, unknown>) => ({
  id: 't0',
  value: 'x',
  label: 'X',
  archived: false,
  questionCount: 0,
  shared: false,
  ...over,
});
const base = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/admin/clients': {
    body: { items: [{ id: 'c1', name: 'Python', description: null, userCount: 2 }] },
  },
  'GET /api/admin/clients/c1/technologies': {
    body: {
      active: [
        tech({ id: 't1', value: 'django', label: 'Django', questionCount: 4 }),
        tech({ id: 't2', value: 'python', label: 'Python', questionCount: 9, shared: true }),
      ],
      archived: [tech({ id: 't3', value: 'celery', label: 'Celery', archived: true })],
      available: [{ id: 't9', label: 'Node.js' }],
    },
  },
};

async function openEdit() {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Python' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit Python' });
  await within(dialog).findByRole('list', { name: 'Technologies of Python' });
  return dialog;
}

describe('department technologies (edit dialog)', () => {
  it('lists active and archived technologies of the department, with shared noted', async () => {
    mockApi(base);
    renderApp('/admin/departments');
    const dialog = await openEdit();
    const active = within(dialog).getByRole('list', { name: 'Technologies of Python' });
    expect(active).toHaveTextContent('Django');
    expect(active).toHaveTextContent('4 questions');
    expect(active).toHaveTextContent('also used by other departments');
    expect(
      within(dialog).getByRole('list', { name: 'Archived technologies of Python' }),
    ).toHaveTextContent('Celery');
    expect(dialog.querySelector('datalist option[value="Node.js"]')).not.toBeNull();
  });

  it('adds a technology by name and says whether it linked an existing one', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/admin/clients/c1/technologies': {
        status: 201,
        body: { technology: { id: 't9', label: 'Node.js', created: false } },
      },
    });
    renderApp('/admin/departments');
    const dialog = await openEdit();
    await userEvent.type(within(dialog).getByLabelText('Add a technology'), 'node.js');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Added existing Node.js')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/api/admin/clients/c1/technologies',
      body: { label: 'node.js' },
    });
  });

  it('removing a shared technology says it was only removed here; an exclusive one is archived', async () => {
    const calls = mockApi({
      ...base,
      'DELETE /api/admin/clients/c1/technologies/t1': { status: 204 },
      'DELETE /api/admin/clients/c1/technologies/t2': { status: 204 },
    });
    renderApp('/admin/departments');
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Python' }));
    expect(await screen.findByText('Removed Python from Python')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Django' }));
    expect(await screen.findByText('Archived Django')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/admin/clients/c1/technologies/t2',
      '/api/admin/clients/c1/technologies/t1',
    ]);
  });

  it('restores an archived technology', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/admin/clients/c1/technologies/t3/restore': { status: 204 },
    });
    renderApp('/admin/departments');
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore Celery' }));
    expect(await screen.findByText('Restored Celery')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/admin/clients/c1/technologies/t3/restore')).toBe(
      true,
    );
  });

  it('renames a technology and shows a clash from the server', async () => {
    const calls = mockApi({
      ...base,
      'PATCH /api/admin/technologies/t1': {
        status: 409,
        body: {
          error: {
            code: 'TECHNOLOGY_EXISTS',
            message: 'A technology with this name already exists',
          },
        },
      },
    });
    renderApp('/admin/departments');
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename Django' }));
    const input = within(dialog).getByLabelText('New name for Django');
    await userEvent.clear(input);
    await userEvent.type(input, 'Node JS');
    await userEvent.click(within(input.closest('form')!).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('A technology with this name already exists'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: '/api/admin/technologies/t1',
      body: { label: 'Node JS' },
    });
  });

  it('the delete dialog says how many technologies will be archived', async () => {
    mockApi({
      ...base,
      'GET /api/admin/clients/c1/impact': {
        body: { questions: 3, pending: 0, users: 2, technologies: 2 },
      },
    });
    renderApp('/admin/departments');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Python' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Python?' });
    expect(
      await within(dialog).findByText(
        /2 technologies used only by this department will be archived/,
      ),
    ).toBeInTheDocument();
  });

  it('has no axe violations and no Technologies link in the admin nav', async () => {
    mockApi(base);
    const { container } = renderApp('/admin/departments');
    const dialog = await openEdit();
    expect(screen.queryByRole('link', { name: 'Technologies' })).toBeNull();
    const results = await axe.run(dialog);
    expect(results.violations).toEqual([]);
    void container;
  });
});

describe('question form follows the department', () => {
  const clients = {
    items: [
      { id: 'c1', name: 'Python', technologies: ['django'] },
      { id: 'c2', name: 'MERN', technologies: ['react', 'nodejs'] },
    ],
  };
  const tags = {
    categories: [
      {
        slug: 'technology',
        name: 'Technology',
        tags: [
          { value: 'django', label: 'Django' },
          { value: 'react', label: 'React' },
          { value: 'nodejs', label: 'Node.js' },
        ],
      },
    ],
  };
  const handlers = {
    ...baseHandlers,
    'GET /api/clients': { body: clients },
    'GET /api/tags': { body: tags },
  };

  it("offers every technology for a global question and only the department's once one is chosen", async () => {
    mockApi(handlers);
    renderApp('/questions/new');
    expect(await screen.findByRole('checkbox', { name: 'Django' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/Who can see/), 'c1');
    expect(screen.getByRole('checkbox', { name: 'Django' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'React' })).toBeNull();
    expect(screen.getByText(/Technologies are the ones Python uses/)).toBeInTheDocument();
  });

  it('drops a selected technology that the newly chosen department does not have', async () => {
    mockApi(handlers);
    renderApp('/questions/new');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'React' }));
    expect(screen.getByRole('checkbox', { name: /React/ })).toBeChecked();
    await userEvent.selectOptions(screen.getByLabelText(/Who can see/), 'c1'); // Python: no React
    expect(screen.queryByRole('checkbox', { name: 'React' })).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText(/Who can see/), 'c2'); // MERN: React back, unchecked
    expect(screen.getByRole('checkbox', { name: 'React' })).not.toBeChecked();
  });
});
