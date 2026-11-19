import { screen, waitFor, within } from '@testing-library/react';
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

  describe('editing a question into a near-duplicate', () => {
    const original = question({
      text: 'Original question text',
      updatedAt: '2026-01-02T10:00:00.000Z',
      tags: [],
    });
    const dup = {
      status: 409,
      body: {
        error: {
          code: 'DUPLICATE_SUSPECTED',
          message: 'A very similar question already exists',
          matches: [{ id: 'q9', text: 'Almost the same question text', similarity: 0.82 }],
        },
      },
    };

    it('shows the matches, and saving anyway resends the edit with confirmNotDuplicate', async () => {
      let first = true;
      const calls = mockApi({
        ...handlers,
        'GET /api/questions/q1': { body: { question: original } },
        'GET /api/questions/q1/history': { body: { items: [] } },
        'PATCH /api/questions/q1': () =>
          first ? ((first = false), dup) : { body: { question: original } },
      });
      renderApp('/questions/q1/edit');
      await userEvent.type(await screen.findByLabelText('Question'), ' reworded');
      await userEvent.click(screen.getByRole('button', { name: 'Save and resubmit' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Almost the same question text');
      await userEvent.click(within(dialog).getByRole('button', { name: /anyway/i }));
      await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2));
      expect(calls.filter((c) => c.method === 'PATCH')[1]!.body).toMatchObject({
        confirmNotDuplicate: true,
      });
    });
  });

  describe('editing a question someone else is also editing', () => {
    const original = question({
      text: 'Original question text',
      updatedAt: '2026-01-02T10:00:00.000Z',
      tags: [],
    });
    const theirs = question({
      text: 'Their saved version',
      updatedAt: '2026-01-02T11:00:00.000Z',
      tags: [],
    });

    it('sends the version you opened, so the server can tell if it changed', async () => {
      const calls = mockApi({
        ...handlers,
        'GET /api/questions/q1': { body: { question: original } },
        'PATCH /api/questions/q1': { body: { question: theirs } },
        'GET /api/questions/q1/history': { body: { items: [] } },
      });
      renderApp('/questions/q1/edit');
      await userEvent.type(await screen.findByLabelText('Question'), ' plus more');
      await userEvent.click(screen.getByRole('button', { name: 'Save and resubmit' }));
      await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
      expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({
        text: 'Original question text plus more',
        expectedUpdatedAt: '2026-01-02T10:00:00.000Z',
      });
    });

    it('on a conflict says what happened, keeps your text, and loads their version on request', async () => {
      let served = original;
      mockApi({
        ...handlers,
        'GET /api/questions/q1': () => ({ body: { question: served } }),
        'PATCH /api/questions/q1': {
          status: 409,
          body: {
            error: {
              code: 'EDIT_CONFLICT',
              message:
                'Someone else changed this question while you were editing it. Reload to see their version.',
            },
          },
        },
      });
      renderApp('/questions/q1/edit');
      await userEvent.type(await screen.findByLabelText('Question'), ' MY EDIT');
      await userEvent.click(screen.getByRole('button', { name: 'Save and resubmit' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/Someone else changed this question/);
      expect(screen.getByLabelText('Question')).toHaveValue('Original question text MY EDIT'); // nothing lost yet

      served = theirs;
      await userEvent.click(screen.getByRole('button', { name: 'Load their version' }));
      await waitFor(() =>
        expect(screen.getByLabelText('Question')).toHaveValue('Their saved version'),
      );
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
