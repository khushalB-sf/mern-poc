import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { Button } from '../../shared/ui/Button';
import { TextField } from '../../shared/ui/Field';
import { useLogin, useMe } from './hooks';

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

// Seeded demo users (see the seed script). Emails only: the password is never shipped to the browser.
const DEMO_ACCOUNTS = [
  { email: 'author.acme@example.com', label: 'Author with Acme access' },
  { email: 'author.none@example.com', label: 'Author with no client access' },
  { email: 'reviewer@example.com', label: 'Reviewer with Acme access' },
  { email: 'user@example.com', label: 'Read-only user' },
];
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

function errorMessage(e: unknown) {
  if (e instanceof ApiError && e.status === 401) return 'The email or password is incorrect.';
  if (e instanceof ApiError && e.status === 429)
    return 'Too many attempts. Wait a minute, then try again.';
  return "We couldn't sign you in. Check your connection and try again.";
}

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { data: me } = useMe();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (me) return <Navigate to={from} replace />;

  const { ref: passwordFormRef, ...passwordField } = register('password');

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10"
    >
      <h1 className="font-serif text-4xl font-semibold leading-tight">Question bank</h1>
      <p className="mt-2 text-ink-soft">Sign in to find, add and review interview questions.</p>

      <form
        noValidate
        onSubmit={handleSubmit((v) =>
          login.mutate(v, { onSuccess: () => navigate(from, { replace: true }) }),
        )}
        className="mt-8 space-y-4"
      >
        {login.isError && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger"
          >
            {errorMessage(login.error)}
          </p>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          error={errors.email?.message}
          {...register('email')}
        />
        <div>
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            error={errors.password?.message}
            {...passwordField}
            ref={(el) => {
              passwordFormRef(el);
              passwordRef.current = el;
            }}
          />
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Show password
          </label>
        </div>
        <Button type="submit" variant="primary" loading={login.isPending} className="w-full">
          Sign in
        </Button>
      </form>

      {SHOW_DEMO && (
        <details className="mt-8 rounded-md border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Demo accounts</summary>
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-sm text-ink-soft">
              Choose one to fill in the email. The password is in the project README.
            </p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setValue('email', a.email, { shouldValidate: true });
                      passwordRef.current?.focus();
                    }}
                    className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent-soft"
                  >
                    <span className="block font-medium">{a.label}</span>
                    <span className="text-ink-soft">{a.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </main>
  );
}
