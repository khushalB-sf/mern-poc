import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { baseHandlers, mockApi, page, renderApp, USER } from './helpers';

const signedOut = {
  'GET /api/auth/me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
};

describe('login', () => {
  it('redirects signed-out visitors from a protected page to /login', async () => {
    mockApi({ ...signedOut });
    const { router } = renderApp('/questions/new');
    await screen.findByRole('heading', { name: 'Question bank' });
    expect(router.state.location.pathname).toBe('/login');
  });

  it('validates before calling the server', async () => {
    const calls = mockApi({ ...signedOut });
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/auth/login')).toBe(false);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a malformed email', async () => {
    mockApi({ ...signedOut });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('shows a plain message for a wrong password and keeps the form usable', async () => {
    mockApi({
      ...signedOut,
      'POST /api/auth/login': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' } },
      },
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@x.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is incorrect.',
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('explains rate limiting', async () => {
    mockApi({
      ...signedOut,
      'POST /api/auth/login': {
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'x' } },
      },
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@x.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('signs in, then lands on the page the user originally asked for', async () => {
    let signedIn = false;
    mockApi({
      ...baseHandlers,
      'GET /api/auth/me': () =>
        signedIn
          ? { body: { user: USER } }
          : { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
      'POST /api/auth/login': () => {
        signedIn = true;
        return { body: { user: USER } };
      },
      'GET /api/questions': { body: page([]) },
    });
    const { router } = renderApp('/questions/new');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@x.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Add a question' });
    expect(router.state.location.pathname).toBe('/questions/new');
  });

  it('can show the password, and the password is never stored in the browser', async () => {
    mockApi({ ...signedOut });
    renderApp('/login');
    const pw = await screen.findByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.type(pw, 'secret');
    await userEvent.click(screen.getByLabelText('Show password'));
    expect(pw).toHaveAttribute('type', 'text');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('fills the email from a demo account (dev builds only) without touching the password', async () => {
    mockApi({ ...signedOut });
    renderApp('/login');
    await userEvent.click(await screen.findByText('Demo accounts'));
    await userEvent.click(screen.getByRole('button', { name: /Reviewer with Acme access/ }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('reviewer@example.com'));
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});
