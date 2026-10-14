import { screen, within } from '@testing-library/react';
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
});
