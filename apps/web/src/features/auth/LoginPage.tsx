import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { Button } from '../../shared/ui/Button';
import { TextField } from '../../shared/ui/Field';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { DEMO_ACCOUNTS, DEMO_CLIENTS } from './demoAccounts';
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

const DEMO_PASSWORD: string = import.meta.env.VITE_DEMO_PASSWORD ?? 'Passw0rd!demo';
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

const PITCH: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'search',
    title: 'Find the right question fast',
    text: 'Search question text and answer notes, then narrow by technology, level or type.',
  },
  {
    icon: 'shield',
    title: 'Reviewed before it goes live',
    text: 'New questions wait for a reviewer, so the bank stays trustworthy.',
  },
  {
    icon: 'lock',
    title: 'Department-aware access',
    text: 'Restricted questions are visible only to people granted that department.',
  },
];

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

  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <section className="flex flex-col justify-center bg-linear-to-br from-side-bg via-side-bg to-side-active px-6 py-8 text-side-ink sm:px-10 lg:px-16 lg:py-16">
        <div className="max-w-lg">
          <span
            aria-hidden="true"
            className="mb-5 flex size-11 items-center justify-center rounded-xl bg-accent text-accent-ink"
          >
            <Icon name="list" className="size-5" />
          </span>
          <h1 className="font-serif text-4xl font-semibold leading-tight lg:text-5xl">
            Question bank
          </h1>
          <p className="mt-3 text-lg text-side-soft">
            Sign in to find, add and review interview questions.
          </p>
          <ul className="mt-10 hidden space-y-6 lg:block">
            {PITCH.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-side-line bg-side-active/60 text-side-ink"
                >
                  <Icon name={p.icon} className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-side-soft">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <h2 className="font-serif text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-ink-soft">Use your work email to continue.</p>

          <form
            noValidate
            onSubmit={handleSubmit((v) =>
              login.mutate(v, { onSuccess: () => navigate(from, { replace: true }) }),
            )}
            className="mt-6 space-y-4"
          >
            {login.isError && (
              <p
                role="alert"
                className="rounded-lg border border-danger bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger"
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
                {...register('password')}
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

          <p className="mt-4 text-sm">
            <Link to="/how-it-works" className="font-medium text-accent underline">
              How access and permissions work
            </Link>
          </p>

          {SHOW_DEMO && (
            <details className="mt-8 rounded-xl border border-line bg-surface shadow-sm">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Demo accounts
              </summary>
              <div className="border-t border-line px-4 py-3">
                <p className="mb-2 text-sm text-ink-soft">
                  Choose one to fill in the email and password. A department grant adds that
                  department&apos;s questions on top of the global ones.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Demo accounts, their role and department grants
                    </caption>
                    <thead>
                      <tr className="border-b border-line text-left text-ink-soft">
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          Account
                        </th>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          Role
                        </th>
                        {['Global', ...DEMO_CLIENTS].map((c) => (
                          <th key={c} scope="col" className="px-2 py-1.5 text-center font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_ACCOUNTS.map((a) => (
                        <tr key={a.email} className="border-b border-line last:border-b-0">
                          <td className="p-0">
                            <button
                              type="button"
                              onClick={() => {
                                setValue('email', a.email, { shouldValidate: true });
                                setValue('password', DEMO_PASSWORD, { shouldValidate: true });
                              }}
                              className="w-full rounded-lg px-2 py-2 text-left hover:bg-accent-soft"
                            >
                              <span className="block font-medium">{a.label}</span>
                              <span className="text-ink-soft">{a.email}</span>
                            </button>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{a.role}</td>
                          {['Global', ...DEMO_CLIENTS].map((c) => {
                            // Global questions need no grant: every account sees them.
                            const granted =
                              c === 'Global' ||
                              a.seesAll ||
                              (a.grants as readonly string[]).includes(c);
                            return (
                              <td key={c} className="px-2 py-2 text-center">
                                <span
                                  aria-hidden="true"
                                  className={granted ? 'font-semibold' : 'text-ink-soft'}
                                >
                                  {granted ? '✓' : '–'}
                                </span>
                                <span className="sr-only">
                                  {granted ? 'Has access' : 'No access'}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
