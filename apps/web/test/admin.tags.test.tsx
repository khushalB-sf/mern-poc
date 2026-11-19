import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, renderApp } from './helpers';

const adminUser = { id: 'a1', email: 'ada@x.dev', name: 'Ada Admin', role: 'ADMIN' } as const;
const tag = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  id,
  value: label.toLowerCase(),
  label,
  archived: false,
  questionCount: 3,
  ...over,
});
const categories = {
  items: [
    {
      slug: 'seniority',
      name: 'Seniority level',
      tags: [tag('t1', 'Junior'), tag('t2', 'Mid', { archived: true, questionCount: 0 })],
    },
    { slug: 'type', name: 'Question type', tags: [tag('t3', 'Coding')] },
  ],
};
const base = {
  ...baseHandlers,
  'GET /api/auth/me': { body: { user: adminUser } },
  'GET /api/questions': { body: page([]) },
  'GET /api/admin/tag-categories': { body: categories },
};

describe('admin tags (seniority, question type)', () => {
  it('is in the admin navigation and blocks non-admins', async () => {
    mockApi(base);
    const first = renderApp('/');
    expect(await screen.findByRole('link', { name: 'Tags' })).toHaveAttribute(
      'href',
      '/admin/tags',
    );
    first.unmount();
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([]) } });
    renderApp('/admin/tags');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  const tableOf = () => screen.findByRole('table', { name: /Tags, their list/ });
  const addTag = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Add tag' }));
    return screen.findByRole('dialog', { name: 'Add tag' });
  };

  it('lists the tags of every list in one table, with usage; archived ones are filtered out by default', async () => {
    mockApi(base);
    renderApp('/admin/tags');
    const table = await tableOf();
    expect(
      within(table).getByRole('row', { name: /Junior.*Seniority level.*3/ }),
    ).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Coding.*Question type/ })).toBeInTheDocument();
    expect(within(table).queryByText('Mid')).toBeNull(); // archived
    expect(screen.getByText('2 of 3 tags')).toBeInTheDocument();
  });

  it('filters by list and by status, and searches by name', async () => {
    mockApi(base);
    renderApp('/admin/tags');
    const table = await tableOf();
    const names = () =>
      within(table)
        .getAllByRole('rowheader')
        .map((h) => h.textContent);

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'archived');
    expect(names()).toEqual(['Mid']);
    expect(within(table).getByText('Archived')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Restore Mid' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'all');
    expect(names()).toEqual(['Coding', 'Junior', 'Mid']);

    await userEvent.selectOptions(screen.getByLabelText('List'), 'seniority');
    expect(names()).toEqual(['Junior', 'Mid']);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tags' }), 'jun');
    expect(names()).toEqual(['Junior']);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tags' }), 'xyz');
    expect(await screen.findByText('No tags match')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    // back to the default (active only); the table was replaced by the empty state, so look it up again
    const again = await tableOf();
    expect(
      within(again)
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['Coding', 'Junior']);
  });

  it('adds a tag to a chosen list from the Add tag dialog', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/admin/tag-categories/seniority/tags': {
        status: 201,
        body: { tag: { id: 't9', value: 'staff', label: 'Staff' } },
      },
    });
    renderApp('/admin/tags');
    const dialog = await addTag();
    await userEvent.selectOptions(within(dialog).getByLabelText('List'), 'seniority');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Staff');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add tag' }));
    expect(await screen.findByText('Added Staff')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/api/admin/tag-categories/seniority/tags',
      body: { label: 'Staff' },
    });
  });

  it('the dialog starts on the list you are filtering by', async () => {
    mockApi(base);
    renderApp('/admin/tags');
    await tableOf();
    await userEvent.selectOptions(screen.getByLabelText('List'), 'type');
    const dialog = await addTag();
    expect(within(dialog).getByLabelText('List')).toHaveValue('type');
  });

  it('shows the API message when the name is already used', async () => {
    mockApi({
      ...base,
      'POST /api/admin/tag-categories/type/tags': {
        status: 409,
        body: { error: { code: 'TAG_EXISTS', message: 'That name is already used in this list' } },
      },
    });
    renderApp('/admin/tags');
    const dialog = await addTag();
    await userEvent.selectOptions(within(dialog).getByLabelText('List'), 'type');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'coding');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add tag' }));
    expect(
      await within(dialog).findByText('That name is already used in this list'),
    ).toBeInTheDocument();
  });

  it('renames, archives and restores', async () => {
    const calls = mockApi({
      ...base,
      'PATCH /api/admin/tags/t1': { body: { tag: { id: 't1', label: 'Entry level' } } },
      'POST /api/admin/tags/t1/archive': { status: 204 },
      'POST /api/admin/tags/t2/restore': { status: 204 },
    });
    renderApp('/admin/tags');
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Junior' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename Junior' });
    const input = within(dialog).getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Entry level');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Renamed to Entry level')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive Junior' }));
    expect(await screen.findByText('Archived Junior')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'archived');
    await userEvent.click(screen.getByRole('button', { name: 'Restore Mid' }));
    expect(await screen.findByText('Restored Mid')).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)).toEqual([
      'PATCH /api/admin/tags/t1',
      'POST /api/admin/tags/t1/archive',
      'POST /api/admin/tags/t2/restore',
    ]);
  });

  it('has no axe violations', async () => {
    mockApi(base);
    const { container } = renderApp('/admin/tags');
    await tableOf();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
