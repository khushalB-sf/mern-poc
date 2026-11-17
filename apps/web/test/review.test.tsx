import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, question, renderApp, USER } from './helpers';

const REVIEWER = { ...USER, id: 'rev', name: 'Rex Reviewer', role: 'REVIEWER' } as const;
const asReviewer = { 'GET /api/auth/me': { body: { user: REVIEWER } } };
const pending = question({ status: 'PENDING' });

const detail = (q = pending, extra: Record<string, unknown> = {}) => ({
  ...baseHandlers,
  'GET /api/questions/q1': { body: { question: q } },
  'GET /api/questions/q1/history': { body: { items: [] } },
  ...extra,
});

describe('review panel', () => {
  it('a reviewer approves a pending question with no note', async () => {
    const calls = mockApi(
      detail(pending, {
        ...asReviewer,
        'POST /api/questions/q1/review': { body: { question: { ...pending, status: 'APPROVED' } } },
      }),
    );
    renderApp('/questions/q1');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Question approved')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      decision: 'APPROVED',
      note: '',
    });
  });

  it('rejecting needs a note: blocked locally with no request, then sent with the trimmed note', async () => {
    const calls = mockApi(
      detail(pending, {
        ...asReviewer,
        'POST /api/questions/q1/review': { body: { question: { ...pending, status: 'REJECTED' } } },
      }),
    );
    renderApp('/questions/q1');
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText(/Tell the author why/)).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.type(screen.getByLabelText('Note'), '  Too vague  ');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      decision: 'REJECTED',
      note: 'Too vague',
    });
  });

  it('explains a 409 when another reviewer got there first', async () => {
    mockApi(
      detail(pending, {
        ...asReviewer,
        'POST /api/questions/q1/review': {
          status: 409,
          body: {
            error: { code: 'NOT_PENDING', message: 'This question has already been reviewed' },
          },
        },
      }),
    );
    renderApp('/questions/q1');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already reviewed/);
  });

  it.each([
    ['an author', { ...USER, role: 'AUTHOR' }, pending],
    ['a read-only user', { ...USER, role: 'USER' }, pending],
    ['a reviewer, on an already-decided question', REVIEWER, question({ status: 'APPROVED' })],
    [
      'a reviewer, on their own question',
      REVIEWER,
      question({ status: 'PENDING', author: { id: 'rev', name: 'Rex' } }),
    ],
  ])('is not offered to %s', async (_n, user, q) => {
    mockApi(detail(q, { 'GET /api/auth/me': { body: { user } } }));
    renderApp('/questions/q1');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });
});

describe('review panel for admins', () => {
  const ADMIN = { ...USER, id: 'adm', name: 'Ada Admin', role: 'ADMIN' } as const;
  const asAdmin = { 'GET /api/auth/me': { body: { user: ADMIN } } };

  it('is offered on a pending question as "Review this question"', async () => {
    mockApi(detail(pending, asAdmin));
    renderApp('/questions/q1');
    expect(
      await screen.findByRole('heading', { name: 'Review this question' }),
    ).toBeInTheDocument();
  });

  it('is offered on an already-decided question, as a way to change the decision', async () => {
    const calls = mockApi(
      detail(question({ status: 'APPROVED' }), {
        ...asAdmin,
        'POST /api/questions/q1/review': { body: { question: { ...pending, status: 'REJECTED' } } },
      }),
    );
    renderApp('/questions/q1');
    expect(await screen.findByRole('heading', { name: 'Change the decision' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Note'), 'Outdated');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      decision: 'REJECTED',
      note: 'Outdated',
    });
  });
});

describe('status and decisions in the UI', () => {
  it('shows the status, and the reviewer decision with its note, on the question', async () => {
    mockApi(
      detail(
        question({
          status: 'REJECTED',
          review: {
            note: 'Add a scenario',
            reviewer: { id: 'rev', name: 'Rex Reviewer' },
            at: '2026-01-03T10:00:00.000Z',
          },
        }),
      ),
    );
    renderApp('/questions/q1');
    expect(await screen.findByText('Rejected')).toBeInTheDocument(); // the badge text is "Rejected"
    expect(screen.getByRole('heading', { name: /Rejected by Rex Reviewer/ })).toBeInTheDocument();
    expect(screen.getByText('Add a scenario')).toBeInTheDocument();
    // The author is told editing resubmits.
    expect(screen.getByText('Saving changes sends it back for review.')).toBeInTheDocument();
  });

  it('history names the decision and quotes the note', async () => {
    mockApi(
      detail(question(), {
        'GET /api/questions/q1/history': {
          body: {
            items: [
              {
                id: 'h1',
                type: 'QUESTION_REJECTED',
                at: '2026-01-03T10:00:00.000Z',
                actor: { id: 'rev', name: 'Rex Reviewer' },
                note: 'Too broad',
              },
            ],
          },
        },
      }),
    );
    renderApp('/questions/q1');
    const item = await screen.findByText('Rejected by Rex Reviewer');
    expect(within(item.closest('li')!).getByText(/Too broad/)).toBeInTheDocument();
  });

  it('list rows carry a status badge', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions': { body: page([question({ status: 'PENDING' })]) },
    });
    renderApp('/');
    const row = (await screen.findByRole('link', { name: /rate limiter/ })).closest('li')!;
    expect(within(row).getByText('Pending review')).toBeInTheDocument();
  });
});

describe('status filter', () => {
  it('is offered to authors, sent to the API, and shown as a removable chip', async () => {
    const calls = mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([question()]) } });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    await userEvent.click(screen.getByRole('radio', { name: 'Pending review' }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.path.includes('/api/questions?') && c.path.includes('status=PENDING')),
      ).toBe(true),
    );
    expect(await screen.findByRole('button', { name: /Pending review/ })).toBeInTheDocument();
  });

  it('is not offered to read-only users, who only ever see approved questions', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/auth/me': { body: { user: { ...USER, role: 'USER' } } },
      'GET /api/questions': { body: page([question()]) },
    });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    expect(screen.queryByRole('radio', { name: 'Pending review' })).toBeNull();
  });
});
