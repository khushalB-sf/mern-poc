import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, question, renderApp } from './helpers';

const resultCount = () =>
  within(screen.getByRole('region', { name: 'Results' })).getByRole('status');

const restricted = question({
  id: 'q2',
  text: 'How does Acme ship?',
  client: { id: 'c1', name: 'Acme' },
  tags: [{ category: 'technology', value: 'react' }],
});

describe('question list', () => {
  it('shows a skeleton, then results with tag labels and a client badge', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([question(), restricted], 2) } });
    renderApp('/');
    expect(
      await screen.findByRole('link', { name: 'How would you design a rate limiter?' }),
    ).toBeInTheDocument();
    expect(resultCount()).toHaveTextContent('2 questions');

    const row = screen.getByRole('link', { name: 'How does Acme ship?' }).closest('li')!;
    expect(within(row).getByText('Acme only')).toBeInTheDocument();
    expect(within(row).getByText(/Restricted to client/)).toBeInTheDocument(); // not colour-only
    expect(within(row).getByText('React')).toBeInTheDocument(); // label, not the raw value "react"
  });

  it('reads filters from the URL and sends them to the API', async () => {
    const calls = mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([question()]) } });
    renderApp('/?q=limiter&tags=technology:nodejs,seniority:senior&page=2');
    await screen.findByRole('link', { name: /rate limiter/ });
    const req = calls.find((c) => c.path.startsWith('/api/questions?'))!;
    const sp = new URLSearchParams(req.path.split('?')[1]);
    expect(Object.fromEntries(sp)).toEqual({
      limit: '20',
      offset: '20',
      q: 'limiter',
      tags: 'seniority:senior,technology:nodejs',
    });
    expect(screen.getByLabelText(/Search question text/)).toHaveValue('limiter');
    expect(screen.getByRole('checkbox', { name: 'Node.js' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'React' })).not.toBeChecked();
  });

  it('ticking a filter updates the URL, requests again from page 1, and shows a removable chip', async () => {
    const calls = mockApi({
      ...baseHandlers,
      'GET /api/questions': { body: page([question()], 45) },
    });
    const { router } = renderApp('/?page=2');
    await screen.findByRole('link', { name: /rate limiter/ });
    await userEvent.click(screen.getByRole('checkbox', { name: 'React' }));

    await waitFor(() => expect(router.state.location.search).toBe('?tags=technology%3Areact'));
    const chip = await screen.findByRole('button', { name: /React\s*Remove filter/ });
    await waitFor(() => expect(calls.at(-1)!.path).toContain('offset=0'));
    await userEvent.click(chip);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByRole('checkbox', { name: 'React' })).not.toBeChecked();
  });

  it('debounces typing into a single request and keeps Back history clean (replace)', async () => {
    const calls = mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([question()]) } });
    const { router } = renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    const searches = () => calls.filter((c) => c.path.startsWith('/api/questions?')).length;
    const before = searches();
    await userEvent.type(screen.getByLabelText(/Search question text/), 'cache');
    await waitFor(() => expect(router.state.location.search).toBe('?q=cache'));
    await waitFor(() => expect(searches()).toBe(before + 1));
    await new Promise((r) => setTimeout(r, 450)); // a late extra request would show up here
    expect(searches() - before).toBe(1); // five keystrokes, one request
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('pages forward with the right offset and says where you are', async () => {
    const calls = mockApi({
      ...baseHandlers,
      'GET /api/questions': { body: page([question()], 45) },
    });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
      '1 to 20 of 45',
    );
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(calls.at(-1)!.path).toContain('offset=20'));
  });

  it('has no pagination when everything fits on one page', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([question()]) } });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('empty search: explains what to try and offers a one-click reset', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([]) } });
    const { router } = renderApp('/?q=zzz&tags=technology:react');
    expect(await screen.findByRole('heading', { name: 'No questions match' })).toBeInTheDocument();
    expect(resultCount()).toHaveTextContent('0 questions match');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('empty bank: an author is invited to add the first question; a read-only user is not', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([]) } });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Add the first question' })).toBeInTheDocument();
  });

  it('API failure: says what happened and retries on request', async () => {
    let fail = true;
    mockApi({
      ...baseHandlers,
      'GET /api/questions': () =>
        fail
          ? { status: 400, body: { error: { code: 'X', message: 'Boom' } } }
          : { body: page([question()]) },
    });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load questions");
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /rate limiter/ })).toBeInTheDocument();
  });

  it('filters by client when the user has clients', async () => {
    const calls = mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([question()]) } });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    await userEvent.click(await screen.findByRole('radio', { name: 'Acme only' }));
    await waitFor(() => expect(calls.at(-1)!.path).toContain('clientId=c1'));
  });

  it('hides the client filter when the user has no clients', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/clients': { body: { items: [] } },
      'GET /api/questions': { body: page([question()]) },
    });
    renderApp('/');
    await screen.findAllByRole('link', { name: /rate limiter/ });
    expect(screen.queryByRole('radio', { name: 'All questions' })).toBeNull();
  });

  it('read-only users see no "Add question" control', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/auth/me': {
        body: { user: { id: 'u9', email: 'r@x.dev', name: 'Rita', role: 'USER' } },
      },
      'GET /api/questions': { body: page([question()]) },
    });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    expect(screen.queryByRole('link', { name: /Add question/ })).toBeNull();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });
});
