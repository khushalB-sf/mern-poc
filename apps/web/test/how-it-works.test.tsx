import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_CLIENTS } from '../src/features/auth/demoAccounts';
import { baseHandlers, mockApi, renderApp } from './helpers';

const signedOut = {
  'GET /api/auth/me': {
    status: 401,
    body: { error: { code: 'UNAUTHENTICATED', message: 'x' } },
  },
};
const TAB_LABELS = [
  'Feature by feature',
  'Learning path',
  'Roles',
  'Grants',
  'Request flow',
  'The decision',
  'Request pipeline',
  'Each operation',
  'Database',
  'Sessions',
  'Approach',
  'Security',
  'Engineering practices',
];

describe('how it works page', () => {
  it('is reachable from the header and opens on the feature walkthrough', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'How it works' }));
    await screen.findByRole('heading', { level: 1, name: 'How it works' });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(TAB_LABELS);
    expect(screen.getByRole('tab', { name: 'Feature by feature' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Roles' }));
    const roles = screen.getByRole('table', { name: 'What each role can do' });
    // Nobody edits someone else's question; only Reviewers decide on it.
    const editOthers = within(roles).getByRole('row', { name: /Edit someone else/ });
    expect(within(editOthers).queryByText('yes')).toBeNull();
    const review = within(roles).getByRole('row', { name: /Approve or reject/ });
    expect(within(review).getByText('Pending, not your own')).toBeInTheDocument();
  });

  it('shows one tab at a time and keeps the open tab in the address', async () => {
    mockApi({ ...baseHandlers });
    const { router } = renderApp('/how-it-works#roles');
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
    const rita = within(grants).getByRole('row', { name: /hannah\.schmidt@mailinator\.com/ });
    expect(within(rita).getAllByText('Yes')).toHaveLength(1 + DEMO_CLIENTS.length); // Global + every department
    const none = within(grants).getByRole('row', { name: /chloe\.martin@mailinator\.com/ });
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
    expect(screen.getByRole('tab', { name: 'Engineering practices' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{ArrowRight}'); // wraps round to the first tab
    expect(screen.getByRole('tab', { name: 'Feature by feature' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('walks each feature through the same five layers, ending at the database', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works');
    const features = await screen.findByRole('group', { name: 'Choose a feature' });
    const buttons = within(features).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Sign in',
      'Search and filter',
      'Open a question',
      'Add a question',
      'Edit a question',
      'Review a question',
      'Manage a department’s technologies',
      'Delete and restore a department',
      'Stay signed in',
    ]);

    for (const b of buttons) {
      await userEvent.click(b);
      const journey = screen.getByRole('list', {
        name: `${b.textContent}: from click to database`,
      });
      const layers = within(journey)
        .getAllByRole('listitem', { name: '' })
        .filter((li) => li.id.startsWith('walk-'))
        .map((li) => li.querySelector('p')?.textContent?.split(' · ')[0]);
      expect(layers).toEqual(['On screen', 'Browser', 'API gates', 'Business rules', 'Database']);
    }

    // A write names the tables it changes: the create transaction touches three.
    await userEvent.click(screen.getByRole('button', { name: 'Add a question' }));
    const tables = screen.getByRole('list', { name: 'Tables touched' });
    expect(within(tables).getByText('question_tag')).toBeInTheDocument();
    expect(within(tables).getAllByText('audit_event')).toHaveLength(2);
  });

  it('presents one step at a time and moves between steps', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works');
    await userEvent.click(await screen.findByRole('button', { name: 'Present step by step' }));
    expect(screen.getByText('Step 1 of 5: On screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Step 2 of 5: Browser')).toBeInTheDocument();
    const lit = document.querySelector('[aria-current="step"]');
    expect(lit?.textContent).toMatch(/React sends the credentials/);

    // Choosing another feature starts it again from the first step.
    await userEvent.click(screen.getByRole('button', { name: 'Edit a question' }));
    expect(screen.getByText('Step 1 of 5: On screen')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.queryByText(/^Step \d of 5/)).not.toBeInTheDocument();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
  });

  it('draws a mind map for each tab, built from the same data as the tables', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#grants');
    const map = await screen.findByRole('list', { name: 'Grant: what you can see: overview' });
    const mern = within(map).getByText('MERN').closest('li')!;
    const mean = within(map).getByText('MEAN').closest('li')!;
    // Aarav holds both grants, so he appears under both departments.
    expect(within(mern).getByText('aarav.mehta@')).toBeInTheDocument();
    expect(within(mean).getByText('aarav.mehta@')).toBeInTheDocument();
    expect(within(mern).queryByText('sofia.rossi@')).not.toBeInTheDocument();
    expect(within(map).getByText('chloe.martin@')).toBeInTheDocument();

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

  it('explains the implementation approach as problem, decision, why and cost', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#approach');
    const list = await screen.findByRole('list', { name: 'Implementation decisions' });
    const decisions = within(list).getAllByRole('listitem');
    // Every decision, not just the first, has all four parts.
    expect(decisions.length).toBeGreaterThanOrEqual(10);
    for (const decision of decisions) {
      for (const label of ['The problem', 'What we did', 'Why', 'The cost']) {
        expect(within(decision).getByText(label)).toBeInTheDocument();
      }
    }
    expect(
      within(list).getByRole('heading', { name: 'Who can see a question is decided in the SQL' }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole('heading', { name: /Technologies belong to departments/ }),
    ).toBeInTheDocument();
  });

  it('pairs every defence with the test that proves it', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#security');
    const table = await screen.findByRole('table', { name: /Threats, the defence/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(within(row).getAllByRole('cell')).toHaveLength(2); // defence, proof (the threat is the row header)
      expect(row.textContent).toMatch(/\.test\.|docs\/|hardening|auth\.test|A\d/);
    }
  });

  it('covers testing, TDD, quality, accessibility, documentation and delivery', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#practices');
    const panel = await screen.findByRole('tabpanel');
    for (const name of [
      'Testing',
      'Test-driven development and the red team',
      'Code quality',
      'Accessibility',
      'Decisions and documentation',
      'Delivery and operations',
    ]) {
      expect(within(panel).getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('states who may delete a question, and lists the notification and audit tables', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#roles');
    const row = (await screen.findByText('Delete a question (hidden, history kept)')).closest(
      'tr',
    )!;
    // Author: their own until approved; Admin: any (not "admin only" any more)
    expect(within(row).getByText('Your own, until approved')).toBeInTheDocument();
    expect(screen.getByText('Browse the audit trail and download it as CSV')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Database' }));
    expect(screen.getAllByText('notification').length).toBeGreaterThan(0);
    expect(screen.getByText(/database trigger refuses UPDATE and DELETE/)).toBeInTheDocument();
  });

  it('maps the Full Stack 101 path to the code, every feature, and the questions to answer', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#path');
    const panel = await screen.findByRole('tabpanel');
    for (const stage of [
      /01 · Understand the backend request flow/,
      /02 · Work with application data/,
      /03 · Build safe and reliable applications/,
      /04 · The implementation path/,
      /05 · Test, observe and run/,
    ]) {
      expect(within(panel).getByRole('heading', { name: stage })).toBeInTheDocument();
    }
    // Every feature row names its API and a test
    const table = within(panel).getByRole('table', { name: /Each feature with its API/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(15);
    for (const row of rows) {
      const cells = within(row).getAllByRole('cell');
      expect(cells.every((c) => (c.textContent ?? '').trim() !== '')).toBe(true);
    }
    expect(within(table).getByRole('rowheader', { name: 'Approve or reject' })).toBeInTheDocument();
    // The questions open to show the answer
    const list = within(panel).getByRole('list', { name: 'Walkthrough questions' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(15);
    await userEvent.click(within(list).getByText(/Why a 404 and not a 403/));
    expect(within(list).getByText(/would confirm the question exists/)).toBeVisible();
  });

  it('describes the review and department-technology features end to end', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works');
    await userEvent.click(await screen.findByRole('button', { name: 'Review a question' }));
    let tables = screen.getByRole('list', { name: 'Tables touched' });
    expect(within(tables).getByText(/QUESTION_APPROVED or QUESTION_REJECTED/)).toBeInTheDocument();
    expect(within(tables).getByText('notification')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Manage a department’s technologies' }),
    );
    tables = screen.getByRole('list', { name: 'Tables touched' });
    expect(within(tables).getByText('client_tag')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete and restore a department' }));
    tables = screen.getByRole('list', { name: 'Tables touched' });
    expect(within(tables).getByText(/deleted_at = now/)).toBeInTheDocument();
  });
});
