import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, question, renderApp, USER } from './helpers';

const zero = { toReview: 0, mine: { pending: 0, rejected: 0, approved: 0 } };
const quiet = {
  ...baseHandlers,
  'GET /api/questions': { body: page([question()]) },
  'GET /api/questions/summary': { body: zero },
  'GET /api/notifications': { body: { items: [], unreadCount: 0 } },
};
const as = (role: string, id = 'u1') => ({
  'GET /api/auth/me': { body: { user: { ...USER, id, role } } },
});

describe('sidebar: what is waiting for me', () => {
  it('a reviewer sees the review queue with how many are waiting, linking to the pending list', async () => {
    mockApi({
      ...quiet,
      ...as('REVIEWER'),
      'GET /api/questions/summary': { body: { ...zero, toReview: 3 } },
    });
    renderApp('/');
    const link = await screen.findByRole('link', { name: 'Review queue, 3 waiting' });
    expect(link).toHaveAttribute('href', '/?status=PENDING');
  });

  it('with an empty queue there is no number, only the link', async () => {
    mockApi({ ...quiet, ...as('REVIEWER') });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Review queue' })).toBeInTheDocument();
  });

  it('an author sees "My questions", flagged when some were rejected', async () => {
    mockApi({
      ...quiet,
      ...as('AUTHOR'),
      'GET /api/questions/summary': {
        body: { toReview: 0, mine: { pending: 2, rejected: 1, approved: 4 } },
      },
    });
    renderApp('/');
    const link = await screen.findByRole('link', { name: 'My questions, 1 rejected' });
    expect(link).toHaveAttribute('href', '/?mine=true');
    expect(screen.queryByRole('link', { name: /Review queue/ })).toBeNull();
  });

  it('a read-only user has neither; everyone has notifications, with the unread count', async () => {
    mockApi({
      ...quiet,
      ...as('USER'),
      'GET /api/notifications': { body: { items: [], unreadCount: 2 } },
    });
    renderApp('/');
    await screen.findByRole('link', { name: 'Notifications, 2 unread' });
    expect(screen.queryByRole('link', { name: /Review queue/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /My questions/ })).toBeNull();
  });
});

describe('list: my questions', () => {
  it('the filter is a toggle that sends mine=true and shows in the URL', async () => {
    const calls = mockApi({ ...quiet, ...as('AUTHOR') });
    const { router } = renderApp('/');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'My questions' }));
    await screen.findByRole('link', { name: /rate limiter/ });
    expect(router.state.location.search).toContain('mine=true');
    expect(
      calls.some((c) => c.path.startsWith('/api/questions?') && c.path.includes('mine=true')),
    ).toBe(true);
  });

  it('comes from the URL, and read-only users are not offered it', async () => {
    mockApi({ ...quiet, ...as('AUTHOR') });
    renderApp('/?mine=true');
    expect(await screen.findByRole('checkbox', { name: 'My questions' })).toBeChecked();
  });

  it('is not shown to a read-only user', async () => {
    mockApi({ ...quiet, ...as('USER') });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    expect(screen.queryByRole('checkbox', { name: 'My questions' })).toBeNull();
  });
});

describe('notifications page', () => {
  const items = [
    {
      id: 'n1',
      type: 'QUESTION_APPROVED',
      questionId: 'q1',
      at: '2026-11-18T10:00:00Z',
      readAt: null,
      question: { id: 'q1', text: 'What is a closure?' },
    },
    {
      id: 'n2',
      type: 'QUESTION_REJECTED',
      questionId: 'q2',
      at: '2026-11-17T10:00:00Z',
      readAt: '2026-11-17T12:00:00Z',
      question: { id: 'q2', text: 'Explain Kafka partitions' },
    },
    {
      id: 'n3',
      type: 'QUESTION_APPROVED',
      questionId: 'q3',
      at: '2026-11-16T10:00:00Z',
      readAt: null,
      question: null,
    },
  ];
  const handlers = { ...quiet, 'GET /api/notifications': { body: { items, unreadCount: 2 } } };

  it('lists each outcome with a link to the question, and says when it is no longer available', async () => {
    mockApi(handlers);
    renderApp('/notifications');
    const list = await screen.findByRole('list', { name: 'Notifications' });
    const [first, second, third] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent('approved');
    expect(within(first!).getByRole('link', { name: 'What is a closure?' })).toHaveAttribute(
      'href',
      '/questions/q1',
    );
    expect(within(first!).getByText('New')).toBeInTheDocument();
    expect(second).toHaveTextContent('rejected');
    expect(within(second!).queryByText('New')).toBeNull();
    expect(third).toHaveTextContent(/no longer available/i);
    expect(within(third!).queryByRole('link')).toBeNull();
  });

  it('marks everything read', async () => {
    const calls = mockApi({ ...handlers, 'POST /api/notifications/read': { status: 204 } });
    renderApp('/notifications');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    await screen.findByRole('list', { name: 'Notifications' });
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/api/notifications/read',
      body: { all: true },
    });
  });

  it('has a friendly empty state, and no axe violations', async () => {
    mockApi(quiet);
    const first = renderApp('/notifications');
    expect(await screen.findByText(/nothing new/i)).toBeInTheDocument();
    first.unmount();
    mockApi(handlers);
    const { container } = renderApp('/notifications');
    await screen.findByRole('list', { name: 'Notifications' });
    expect((await axe.run(container)).violations).toEqual([]);
  });
});

describe('withdrawing your own question', () => {
  const detail = (q: object) => ({
    ...quiet,
    'GET /api/questions/q1': { body: { question: q } },
    'GET /api/questions/q1/history': { body: { items: [] } },
  });

  it('an author can delete their own pending question, and is told what that means', async () => {
    const calls = mockApi({
      ...detail(question({ status: 'PENDING' })),
      ...as('AUTHOR'),
      'DELETE /api/questions/q1': { status: 204 },
    });
    renderApp('/questions/q1');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete question' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this question?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete question' }));
    expect(await screen.findByText('Question deleted')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it("but not once it is approved, and not someone else's", async () => {
    mockApi({ ...detail(question({ status: 'APPROVED' })), ...as('AUTHOR') });
    const first = renderApp('/questions/q1');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Delete question' })).toBeNull();
    first.unmount();

    mockApi({
      ...detail(question({ status: 'PENDING', author: { id: 'other', name: 'Bob' } })),
      ...as('AUTHOR'),
    });
    renderApp('/questions/q1');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Delete question' })).toBeNull();
  });
});
