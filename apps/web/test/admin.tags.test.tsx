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

  it('lists each list with usage, and archived tags separately with Restore', async () => {
    mockApi(base);
    renderApp('/admin/tags');
    const seniority = await screen.findByRole('list', { name: 'Seniority level' });
    expect(seniority).toHaveTextContent('Junior');
    expect(seniority).toHaveTextContent('3 questions');
    expect(within(seniority).queryByText('Mid')).toBeNull();
    expect(screen.getByRole('list', { name: 'Archived Seniority level' })).toHaveTextContent('Mid');
    expect(screen.getByRole('list', { name: 'Question type' })).toHaveTextContent('Coding');
  });

  it('adds a tag to a list, and shows a clash from the server', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/admin/tag-categories/seniority/tags': {
        status: 201,
        body: { tag: { id: 't9', value: 'staff', label: 'Staff' } },
      },
    });
    renderApp('/admin/tags');
    await userEvent.type(await screen.findByLabelText('Add to Seniority level'), 'Staff');
    await userEvent.click(screen.getByRole('button', { name: 'Add to Seniority level list' }));
    expect(await screen.findByText('Added Staff')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/api/admin/tag-categories/seniority/tags',
      body: { label: 'Staff' },
    });

    mockApi({
      ...base,
      'POST /api/admin/tag-categories/type/tags': {
        status: 409,
        body: { error: { code: 'TAG_EXISTS', message: 'That name is already used in this list' } },
      },
    });
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
    await userEvent.type(await screen.findByLabelText('Add to Question type'), 'coding');
    await userEvent.click(screen.getByRole('button', { name: 'Add to Question type list' }));
    expect(await screen.findByText('That name is already used in this list')).toBeInTheDocument();
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
    const input = screen.getByLabelText('New name for Junior');
    await userEvent.clear(input);
    await userEvent.type(input, 'Entry level');
    await userEvent.click(within(input.closest('form')!).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Renamed to Entry level')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive Junior' }));
    expect(await screen.findByText('Archived Junior')).toBeInTheDocument();
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
    await screen.findByRole('list', { name: 'Seniority level' });
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
