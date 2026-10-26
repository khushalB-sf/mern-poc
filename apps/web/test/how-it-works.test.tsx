import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS } from '../src/features/auth/demoAccounts';
import { baseHandlers, mockApi, renderApp } from './helpers';

const signedOut = {
  'GET /api/auth/me': {
    status: 401,
    body: { error: { code: 'UNAUTHENTICATED', message: 'x' } },
  },
};
const TAB_LABELS = [
  'Roles',
  'Grants',
  'Request flow',
  'The decision',
  'Request pipeline',
  'Each operation',
  'Database',
  'Sessions',
];

describe('how it works page', () => {
  it('is reachable from the header and opens on the roles tab', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'How it works' }));
    await screen.findByRole('heading', { level: 1, name: 'How it works' });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(TAB_LABELS);
    expect(screen.getByRole('tab', { name: 'Roles' })).toHaveAttribute('aria-selected', 'true');

    const roles = screen.getByRole('table', { name: 'What each role can do' });
    const editOthers = within(roles).getByRole('row', { name: /Edit someone else/ });
    // Only the Reviewer column allows it.
    expect(within(editOthers).getByText('Any you can see')).toBeInTheDocument();
  });

  it('shows one tab at a time and keeps the open tab in the address', async () => {
    mockApi({ ...baseHandlers });
    const { router } = renderApp('/how-it-works');
    await screen.findByRole('table', { name: 'What each role can do' });
    expect(screen.queryByRole('table', { name: /Demo accounts/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    await userEvent.click(screen.getByRole('tab', { name: 'Grants' }));
    const grants = await screen.findByRole('table', {
      name: /Demo accounts, their role and client grants/,
    });
    expect(screen.queryByRole('table', { name: 'What each role can do' })).not.toBeInTheDocument();
    expect(router.state.location.hash).toBe('#grants');

    // One row per demo account plus the header row.
    expect(within(grants).getAllByRole('row')).toHaveLength(DEMO_ACCOUNTS.length + 1);
    const rita = within(grants).getByRole('row', { name: /reviewer\.both@example\.com/ });
    expect(within(rita).getAllByText('Yes')).toHaveLength(3); // Global, Acme, Globex
    const none = within(grants).getByRole('row', { name: /author\.none@example\.com/ });
    expect(within(none).getAllByText('Yes')).toHaveLength(1); // Global only
  });

  it('opens straight to a tab from the address, and moves between tabs with the arrow keys', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#decision');
    expect(await screen.findByRole('tab', { name: 'The decision' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    screen.getByRole('tab', { name: 'The decision' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Request pipeline' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}'); // wraps round to the first tab
    expect(screen.getByRole('tab', { name: 'Roles' })).toHaveAttribute('aria-selected', 'true');
  });

  it('draws a mind map for each tab, built from the same data as the tables', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#grants');
    const map = await screen.findByRole('list', { name: 'Grant: what you can see: overview' });
    const acme = within(map).getByText('Acme').closest('li')!;
    const globex = within(map).getByText('Globex').closest('li')!;
    // Dan holds both grants, so he appears under both clients.
    expect(within(acme).getByText('author.both@')).toBeInTheDocument();
    expect(within(globex).getByText('author.both@')).toBeInTheDocument();
    expect(within(acme).queryByText('author.globex@')).not.toBeInTheDocument();
    expect(within(map).getByText('author.none@')).toBeInTheDocument();

    for (const label of TAB_LABELS) {
      await userEvent.click(screen.getByRole('tab', { name: label }));
      const panel = screen.getByRole('tabpanel');
      expect(within(panel).getByRole('list', { name: /: overview$/ })).toBeInTheDocument();
    }
  });

  it('traces a request through the gates and lists what each status means', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#flow');
    const gates = await screen.findByRole('list', { name: 'Gates a request passes, in order' });
    const steps = within(gates)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    // The order is the point: authentication, role, validation, then the service.
    expect(steps[1]).toMatch(/^requireAuth/);
    expect(steps[2]).toMatch(/^requireRole/);
    expect(steps[3]).toMatch(/^Zod/);
    expect(steps[4]).toMatch(/service/);

    const statuses = screen.getByRole('table', { name: /Response statuses/ });
    expect(
      within(statuses).getByRole('row', { name: /409.*DUPLICATE_SUSPECTED/ }),
    ).toBeInTheDocument();
    const traces = screen.getByRole('table', { name: /Example requests/ });
    const carol = within(traces).getByRole('row', { name: /Carol/ });
    expect(within(carol).getByText('404')).toBeInTheDocument();
  });

  it('is open to signed-out visitors, with a way back to sign in', async () => {
    mockApi({ ...signedOut });
    const { router } = renderApp('/how-it-works');
    await screen.findByRole('heading', { level: 1, name: 'How it works' });
    expect(router.state.location.pathname).toBe('/how-it-works');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('is linked from the login page', async () => {
    mockApi({ ...signedOut });
    renderApp('/login');
    await userEvent.click(
      await screen.findByRole('link', { name: /How access and permissions work/ }),
    );
    await screen.findByRole('heading', { level: 1, name: 'How it works' });
  });

  it('lists the access checks in order, visibility before role', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#decision');
    const checks = await screen.findByRole('list', { name: 'Order of the access checks' });
    const titles = within(checks)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent);
    expect(titles).toEqual([
      'Who are you?',
      'Can you see this question?',
      'Does your role allow the action?',
    ]);
  });

  it('has no accessibility violations on any tab', async () => {
    mockApi({ ...baseHandlers });
    const { container } = renderApp('/how-it-works');
    await screen.findByRole('heading', { level: 1, name: 'How it works' });
    for (const label of TAB_LABELS) {
      await userEvent.click(screen.getByRole('tab', { name: label }));
      const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
      expect(
        result.violations.map(
          (v) =>
            `${label} - ${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
      ).toEqual([]);
    }
    // One axe scan per tab is slow in jsdom, so this test gets more than the 5 s default.
  }, 30_000);
});
