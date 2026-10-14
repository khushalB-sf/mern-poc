import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, question, renderApp } from './helpers';

/** axe-core on the rendered DOM. Colour contrast needs real layout, so it is checked in a browser instead. */
async function violations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map(
    (v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
}

const restricted = question({
  id: 'q2',
  text: 'How does Acme ship?',
  client: { id: 'c1', name: 'Acme' },
});
const signedOut = {
  'GET /api/auth/me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
};

describe('accessibility (axe-core)', () => {
  it('login page', async () => {
    mockApi(signedOut);
    const { container } = renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });
    expect(await violations(container)).toEqual([]);
  });

  it('login page with validation errors', async () => {
    mockApi(signedOut);
    const { container } = renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    await screen.findByText('Enter your email address');
    expect(await violations(container)).toEqual([]);
  });

  it('question list with results, restricted rows and filters', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions': { body: page([question(), restricted], 45) },
    });
    const { container } = renderApp('/?tags=technology:react');
    await screen.findByRole('link', { name: 'How does Acme ship?' });
    expect(await violations(container)).toEqual([]);
  });

  it('question list: empty state', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([]) } });
    const { container } = renderApp('/?q=zzz');
    await screen.findByRole('heading', { name: 'No questions match' });
    expect(await violations(container)).toEqual([]);
  });

  it('question list: error state', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions': { status: 400, body: { error: { code: 'X', message: 'Boom' } } },
    });
    const { container } = renderApp('/');
    await screen.findByRole('heading', { name: "Couldn't load questions" });
    expect(await violations(container)).toEqual([]);
  });

  it('add-question form, including field errors', async () => {
    mockApi({ ...baseHandlers });
    const { container } = renderApp('/questions/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Add question' }));
    await screen.findByText('Enter the question');
    expect(await violations(container)).toEqual([]);
  });

  it('duplicate dialog', async () => {
    mockApi({
      ...baseHandlers,
      'POST /api/questions': {
        status: 409,
        body: {
          error: {
            code: 'DUPLICATE_SUSPECTED',
            message: 'dup',
            matches: [{ id: 'o1', text: 'Existing question text', similarity: 0.8 }],
          },
        },
      },
    });
    const { container } = renderApp('/questions/new');
    await userEvent.type(await screen.findByLabelText('Question'), 'Existing question text!');
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('This looks like a question we already have');
    expect(await violations(container)).toEqual([]);
  });

  it('question detail with history', async () => {
    mockApi({
      ...baseHandlers,
      'GET /api/questions/q1': { body: { question: restricted } },
      'GET /api/questions/q1/history': {
        body: {
          items: [
            {
              id: 'h',
              type: 'QUESTION_CREATED',
              at: '2026-01-02T10:00:00.000Z',
              actor: { id: 'u1', name: 'Alice' },
            },
          ],
        },
      },
    });
    const { container } = renderApp('/questions/q1');
    await screen.findByText('History');
    await screen.findByText('Added by Alice');
    expect(await violations(container)).toEqual([]);
  });

  it('keyboard: Tab reaches the search box, filters and results in a sensible order', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([question()]) } });
    renderApp('/');
    await screen.findByRole('link', { name: /rate limiter/ });
    await userEvent.tab(); // skip link
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      order.push(
        (document.activeElement as HTMLElement).getAttribute('aria-label') ??
          document.activeElement?.textContent?.trim() ??
          document.activeElement?.tagName ??
          '',
      );
    }
    expect(order[0]).toBe('Question bank'); // brand link
    expect(order.join('|')).toMatch(/Add question/);
  });
});
