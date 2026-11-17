import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, question, renderApp, USER } from './helpers';

const history = [
  {
    id: 'h1',
    type: 'QUESTION_CREATED',
    at: '2026-01-02T10:00:00.000Z',
    actor: { id: 'u1', name: 'Alice Author' },
  },
  {
    id: 'h2',
    type: 'QUESTION_UPDATED',
    at: '2026-01-03T10:00:00.000Z',
    actor: { id: 'r1', name: 'Rex Reviewer' },
    changes: { text: { from: 'a', to: 'b' }, tags: { from: [], to: ['x:y'] } },
  },
];

describe('question detail', () => {
  const handlers = (q = question()) => ({
    ...baseHandlers,
    'GET /api/questions/q1': { body: { question: q } },
    'GET /api/questions/q1/history': { body: { items: history } },
  });

  it('shows the question, notes, tags and history newest first, saying who and what changed', async () => {
    mockApi(handlers());
    renderApp('/questions/q1');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'How would you design a rate limiter?',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Token bucket.')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();

    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Edited by Rex Reviewer: changed question, tags');
    expect(items[1]).toHaveTextContent('Added by Alice Author');
    expect(within(items[1]!).getByText(/2026/)).toHaveAttribute(
      'datetime',
      '2026-01-02T10:00:00.000Z',
    );
  });

  it('offers Edit to the author of the question', async () => {
    mockApi(handlers());
    renderApp('/questions/q1');
    expect(await screen.findByRole('link', { name: /Edit question/ })).toHaveAttribute(
      'href',
      '/questions/q1/edit',
    );
  });

  it('does not offer Edit to another author or a read-only user', async () => {
    mockApi({ ...handlers(question({ author: { id: 'other', name: 'Bob' } })) });
    renderApp('/questions/q1');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /Edit question/ })).toBeNull();

    mockApi({ ...handlers(), 'GET /api/auth/me': { body: { user: { ...USER, role: 'USER' } } } });
    renderApp('/questions/q1');
    await screen.findAllByRole('heading', { level: 1 });
    expect(screen.queryAllByRole('link', { name: /Edit question/ })).toHaveLength(0);
  });

  it('marks a client-restricted question', async () => {
    mockApi(handlers(question({ client: { id: 'c1', name: 'Acme' } })));
    renderApp('/questions/q1');
    expect(await screen.findByText('Acme only')).toBeInTheDocument();
  });

  it('a hidden or missing question shows the same neutral message and a way back', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions/q1': {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Question not found' } },
      },
      'GET /api/questions/q1/history': {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      },
    });
    renderApp('/questions/q1');
    expect(
      await screen.findByRole('heading', { name: "We can't find that question" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('It may have been removed, or you may not have access to it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to all questions' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  describe('admin controls', () => {
    const ADMIN = { ...USER, id: 'adm', name: 'Ada Admin', role: 'ADMIN' } as const;
    const asAdmin = { 'GET /api/auth/me': { body: { user: ADMIN } } };
    const other = question({ author: { id: 'other', name: 'Bob' }, status: 'APPROVED' });

    it('an admin can edit anyone’s question, change the decision and delete it', async () => {
      mockApi({ ...handlers(other), ...asAdmin });
      renderApp('/questions/q1');
      expect(await screen.findByRole('link', { name: /Edit question/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete question' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Change the decision' })).toBeInTheDocument();
      // An admin's edit does not go back for review, so no warning.
      expect(screen.queryByText(/sends it back for review/)).toBeNull();
    });

    it.each(['AUTHOR', 'REVIEWER', 'USER'] as const)('%s gets no Delete button', async (role) => {
      mockApi({
        ...handlers(question({ status: 'APPROVED' })),
        'GET /api/auth/me': { body: { user: { ...USER, role } } },
      });
      renderApp('/questions/q1');
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('button', { name: 'Delete question' })).toBeNull();
    });

    it('delete asks first; cancel does nothing, confirm deletes and returns to the list', async () => {
      const calls = mockApi({
        ...handlers(other),
        ...asAdmin,
        'DELETE /api/questions/q1': { status: 204 },
        'GET /api/questions': { body: { items: [], page: { limit: 20, offset: 0, total: 0 } } },
      });
      const { router } = renderApp('/questions/q1');
      await userEvent.click(await screen.findByRole('button', { name: 'Delete question' }));
      let dialog = await screen.findByRole('dialog', { name: 'Delete this question?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

      await userEvent.click(screen.getByRole('button', { name: 'Delete question' }));
      dialog = await screen.findByRole('dialog', { name: 'Delete this question?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete question' }));
      expect(await screen.findByText('Question deleted')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'DELETE')!.path).toBe('/api/questions/q1');
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });

    it('a failed delete keeps the dialog open with the reason', async () => {
      mockApi({
        ...handlers(other),
        ...asAdmin,
        'DELETE /api/questions/q1': {
          status: 404,
          body: { error: { code: 'NOT_FOUND', message: 'Question not found' } },
        },
      });
      renderApp('/questions/q1');
      await userEvent.click(await screen.findByRole('button', { name: 'Delete question' }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete this question?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete question' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Question not found');
    });
  });
});
