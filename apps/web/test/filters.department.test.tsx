import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, question, renderApp } from './helpers';

const tags = {
  categories: [
    {
      slug: 'technology',
      name: 'Technology',
      tags: [
        { value: 'react', label: 'React' },
        { value: 'django', label: 'Django' },
        { value: 'go', label: 'Go', other: true },
      ],
    },
    { slug: 'seniority', name: 'Seniority level', tags: [{ value: 'mid', label: 'Mid' }] },
  ],
};
const clients = {
  items: [
    { id: 'c1', name: 'MERN', technologies: ['react'] },
    { id: 'c2', name: 'Python', technologies: ['django'] },
    { id: 'c3', name: 'Empty', technologies: [] },
  ],
};
const handlers = {
  ...baseHandlers,
  'GET /api/tags': { body: tags },
  'GET /api/clients': { body: clients },
  'GET /api/questions': { body: page([question()]) },
};

const openTechnology = async () => {
  await userEvent.click(await screen.findByText('Technology', { selector: 'summary span' }));
  return screen.getByRole('group', { name: 'Technology' });
};
const chooseDepartment = async (name: string) => {
  await userEvent.click(screen.getByText('Department', { selector: 'summary span' }));
  await userEvent.click(screen.getByRole('radio', { name }));
};

describe('list filters: technology follows the department', () => {
  it('shows every technology, with unassigned ones under "Other", until a department is chosen', async () => {
    mockApi(handlers);
    renderApp('/');
    const group = await openTechnology();
    expect(within(group).getByRole('checkbox', { name: 'React' })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: 'Django' })).toBeInTheDocument();
    const other = within(group).getByRole('group', { name: 'Other' });
    expect(within(other).getByRole('checkbox', { name: 'Go' })).toBeInTheDocument();
    expect(within(other).queryByRole('checkbox', { name: 'React' })).toBeNull();
  });

  it("choosing a department narrows Technology to that department's technologies", async () => {
    mockApi(handlers);
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    await chooseDepartment('Python only');
    const group = await openTechnology();
    expect(within(group).getByRole('checkbox', { name: 'Django' })).toBeInTheDocument();
    expect(within(group).queryByRole('checkbox', { name: 'React' })).toBeNull();
    expect(within(group).queryByRole('group', { name: 'Other' })).toBeNull();
    // other categories are untouched
    expect(screen.getByText('Seniority level', { selector: 'summary span' })).toBeInTheDocument();
  });

  it('drops picked technologies the new department does not have, and keeps the rest', async () => {
    mockApi(handlers);
    const { router } = renderApp('/?tags=technology:react,seniority:mid');
    await screen.findByRole('link', { name: /rate limiter/ });
    await chooseDepartment('Python only');
    await screen.findByRole('link', { name: /rate limiter/ });
    expect(router.state.location.search).toContain('clientId=c2');
    expect(router.state.location.search).not.toContain('react');
    expect(router.state.location.search).toContain('seniority%3Amid');
  });

  it('clearing the department brings every technology back', async () => {
    mockApi(handlers);
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    await chooseDepartment('Python only');
    await chooseDepartment('All questions');
    const group = await openTechnology();
    expect(within(group).getByRole('checkbox', { name: 'React' })).toBeInTheDocument();
  });

  it('hides the Technology dropdown for a department that has none', async () => {
    mockApi(handlers);
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    await chooseDepartment('Empty only');
    expect(screen.queryByText('Technology', { selector: 'summary span' })).toBeNull();
    expect(screen.getByText('Seniority level', { selector: 'summary span' })).toBeInTheDocument();
  });

  it('has no axe violations with the dropdown open', async () => {
    mockApi(handlers);
    const { container } = renderApp('/');
    await openTechnology();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
