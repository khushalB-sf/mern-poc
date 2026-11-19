import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseHandlers, mockApi, question, renderApp } from './helpers';

const tags = {
  categories: [
    {
      slug: 'technology',
      name: 'Technology',
      tags: [
        { value: 'react', label: 'React' },
        { value: 'django', label: 'Django' },
      ],
    },
  ],
};
const clients = { items: [{ id: 'c1', name: 'Python', technologies: ['django', 'react'] }] };
const handlers = {
  ...baseHandlers,
  'GET /api/tags': { body: tags },
  'GET /api/clients': { body: clients },
};
const reject = (code: string, message: string) => ({
  status: 400,
  body: { error: { code, message } },
});
const gets = (calls: { method: string; path: string }[], path: string) =>
  calls.filter((c) => c.method === 'GET' && c.path === path).length;

afterEach(() => vi.useRealTimers());

describe('the question form copes when technologies changed under it', () => {
  it.each([
    ['TAG_NOT_IN_DEPARTMENT', 'Not a technology of this department: technology:react'],
    ['TAG_ARCHIVED', 'Tag no longer available: technology:react'],
  ])(
    '%s: friendly message, and the tags and departments are fetched again',
    async (code, apiMessage) => {
      const calls = mockApi({ ...handlers, 'POST /api/questions': reject(code, apiMessage) });
      renderApp('/questions/new');
      await userEvent.type(await screen.findByLabelText('Question'), 'What is a closure?');
      await userEvent.click(screen.getByRole('checkbox', { name: 'React' }));
      const before = { tags: gets(calls, '/api/tags'), clients: gets(calls, '/api/clients') };
      await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/technolog/i);
      expect(alert).toHaveTextContent(/refreshed/i);
      expect(alert).not.toHaveTextContent('technology:react'); // no raw tag ids
      await waitFor(() => {
        expect(gets(calls, '/api/tags')).toBeGreaterThan(before.tags);
        expect(gets(calls, '/api/clients')).toBeGreaterThan(before.clients);
      });
    },
  );

  it('editing: the same friendly message', async () => {
    mockApi({
      ...handlers,
      'GET /api/questions/q1': {
        body: { question: question({ tags: [{ category: 'technology', value: 'react' }] }) },
      },
      'PATCH /api/questions/q1': reject(
        'TAG_ARCHIVED',
        'Tag no longer available: technology:react',
      ),
    });
    renderApp('/questions/q1/edit');
    await userEvent.click(await screen.findByRole('button', { name: 'Save and resubmit' }));
    // the form is unchanged, so make a real change first
    await userEvent.type(screen.getByLabelText('Question'), ' again');
    await userEvent.click(screen.getByRole('button', { name: 'Save and resubmit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/refreshed/i);
  });

  it('tags and departments are refreshed when the window regains focus after a minute', async () => {
    const calls = mockApi(handlers);
    renderApp('/questions/new');
    await screen.findByRole('checkbox', { name: 'React' });
    const before = { tags: gets(calls, '/api/tags'), clients: gets(calls, '/api/clients') };

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3 * 60_000);
    window.dispatchEvent(new Event('visibilitychange')); // what TanStack Query listens to

    await waitFor(() => {
      expect(gets(calls, '/api/tags')).toBeGreaterThan(before.tags);
      expect(gets(calls, '/api/clients')).toBeGreaterThan(before.clients);
    });
  });
});
