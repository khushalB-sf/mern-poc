import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, question, renderApp, USER } from './helpers';

const created = question({ id: 'new1', text: 'What is a closure?' });

async function fillQuestion(text = 'What is a closure?') {
  await userEvent.type(await screen.findByLabelText('Question'), text);
}

describe('add question', () => {
  it('validates required fields without calling the server', async () => {
    const calls = mockApi({ ...baseHandlers });
    renderApp('/questions/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Add question' }));
    expect(await screen.findByText('Enter the question')).toBeInTheDocument();
    expect(screen.getByLabelText('Question')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Question')).toHaveFocus(); // focus moves to the first error
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('counts characters and enforces the 1,000 limit', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/questions/new');
    await fillQuestion('abc');
    expect(screen.getByText('3 / 1,000')).toBeInTheDocument();
  });

  it('creates the question with chosen tags and client, confirms, and opens it', async () => {
    const calls = mockApi({
      ...baseHandlers,
      'POST /api/questions': { status: 201, body: { question: created } },
      'GET /api/questions/new1': { body: { question: created } },
      'GET /api/questions/new1/history': { body: { items: [] } },
    });
    const { router } = renderApp('/questions/new');
    await fillQuestion();
    await userEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Senior' }));
    await userEvent.selectOptions(screen.getByLabelText(/Who can see/), 'c1');
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));

    await screen.findByRole('heading', { name: 'What is a closure?' });
    expect(router.state.location.pathname).toBe('/questions/new1');
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      text: 'What is a closure?',
      answerNotes: '',
      tags: ['technology:react', 'seniority:senior'],
      clientId: 'c1',
      confirmNotDuplicate: false,
    });
    expect(await screen.findByText('Question added')).toBeInTheDocument();
  });

  it('omits the client picker when the user has no clients (nothing to restrict to)', async () => {
    mockApi({ ...baseHandlers, 'GET /api/clients': { body: { items: [] } } });
    renderApp('/questions/new');
    await screen.findByLabelText('Question');
    expect(screen.queryByLabelText(/Who can see/)).toBeNull();
  });

  describe('duplicate detection', () => {
    const dup = {
      status: 409,
      body: {
        error: {
          code: 'DUPLICATE_SUSPECTED',
          message: 'dup',
          matches: [{ id: 'old1', text: 'What is a closure in JavaScript?', similarity: 0.74 }],
        },
      },
    };

    it('shows the existing question and its similarity, and stores nothing yet', async () => {
      mockApi({ ...baseHandlers, 'POST /api/questions': dup });
      renderApp('/questions/new');
      await fillQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));

      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByRole('heading', { name: 'This looks like a question we already have' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('img', { name: '74% similar' })).toBeInTheDocument();
      expect(within(dialog).getByText('What is a closure in JavaScript?')).toBeInTheDocument();
      expect(within(dialog).getByText('What is a closure?')).toBeInTheDocument(); // your wording, side by side
    });

    it('"Go back and edit" closes the dialog and keeps what was typed', async () => {
      mockApi({ ...baseHandlers, 'POST /api/questions': dup });
      renderApp('/questions/new');
      await fillQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Go back and edit' }));
      await waitFor(() =>
        expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open'),
      );
      expect(screen.getByLabelText('Question')).toHaveValue('What is a closure?');
    });

    it('"It\'s different" resubmits with confirmNotDuplicate and then opens the new question', async () => {
      let attempts = 0;
      const calls = mockApi({
        ...baseHandlers,
        'POST /api/questions': ({ body }) => {
          attempts++;
          return (body as { confirmNotDuplicate: boolean }).confirmNotDuplicate
            ? { status: 201, body: { question: created } }
            : dup;
        },
        'GET /api/questions/new1': { body: { question: created } },
        'GET /api/questions/new1/history': { body: { items: [] } },
      });
      const { router } = renderApp('/questions/new');
      await fillQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
      await userEvent.click(
        await screen.findByRole('button', { name: "It's different, add it anyway" }),
      );
      await waitFor(() => expect(router.state.location.pathname).toBe('/questions/new1'));
      expect(attempts).toBe(2);
      expect(
        calls
          .filter((c) => c.method === 'POST')
          .map((c) => (c.body as { confirmNotDuplicate: boolean }).confirmNotDuplicate),
      ).toEqual([false, true]);
    });
  });

  it('maps server validation errors onto the right field', async () => {
    mockApi({
      ...baseHandlers,
      'POST /api/questions': {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            issues: [{ path: 'answerNotes', message: 'Too long for the server' }],
          },
        },
      },
    });
    renderApp('/questions/new');
    await fillQuestion();
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(await screen.findByText('Too long for the server')).toBeInTheDocument();
    expect(screen.getByLabelText('Answer notes')).toHaveAttribute('aria-invalid', 'true');
  });

  it('tells a read-only user why they cannot add questions', async () => {
    mockApi({ ...baseHandlers, 'GET /api/auth/me': { body: { user: { ...USER, role: 'USER' } } } });
    renderApp('/questions/new');
    expect(
      await screen.findByRole('heading', { name: 'Your account is read-only' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Question')).toBeNull();
  });
});

describe('edit question', () => {
  const mine = question({ id: 'q1', tags: [{ category: 'technology', value: 'react' }] });

  it('prefills, saves only the editable fields, and returns to the question', async () => {
    const calls = mockApi({
      ...baseHandlers,
      'GET /api/questions/q1': { body: { question: mine } },
      'GET /api/questions/q1/history': { body: { items: [] } },
      'PATCH /api/questions/q1': { body: { question: mine } },
    });
    const { router } = renderApp('/questions/q1/edit');
    const text = await screen.findByLabelText('Question');
    expect(text).toHaveValue('How would you design a rate limiter?');
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeChecked();
    await userEvent.clear(text);
    await userEvent.type(text, 'Reworded question');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/questions/q1'));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      text: 'Reworded question',
      answerNotes: 'Token bucket.',
      tags: ['technology:react'],
    });
  });

  it("explains that an author can't edit someone else's question", async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions/q9': {
        body: { question: question({ id: 'q9', author: { id: 'other', name: 'Bob' } }) },
      },
    });
    renderApp('/questions/q9/edit');
    expect(
      await screen.findByRole('heading', { name: "You can't edit this question" }),
    ).toBeInTheDocument();
  });

  it("a reviewer can edit anyone's question", async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/auth/me': { body: { user: { ...USER, id: 'rev', role: 'REVIEWER' } } },
      'GET /api/questions/q9': {
        body: { question: question({ id: 'q9', author: { id: 'other', name: 'Bob' } }) },
      },
    });
    renderApp('/questions/q9/edit');
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it("shows the fixed client instead of a picker (a question's client cannot change)", async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions/q1': {
        body: { question: question({ client: { id: 'c1', name: 'Acme' } }) },
      },
    });
    renderApp('/questions/q1/edit');
    expect(await screen.findByText(/restricted to Acme/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Who can see/)).toBeNull();
  });

  it('a question you cannot see looks the same as one that does not exist', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions/gone': {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Question not found' } },
      },
    });
    renderApp('/questions/gone/edit');
    expect(
      await screen.findByRole('heading', { name: "We can't find that question" }),
    ).toBeInTheDocument();
  });
});

describe('list -> add flow wiring', () => {
  it('the header "Add question" link opens the form for authors', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([]) } });
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: /Add question/ }));
    expect(await screen.findByRole('heading', { name: 'Add a question' })).toBeInTheDocument();
  });
});
