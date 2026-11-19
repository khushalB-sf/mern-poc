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
import { MfaStep } from './MfaStep';
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
  // Set when the password was right but the account also needs a code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);

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
    <main
      id="main"
      className="grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_26rem]"
    >
      <section className="order-last flex flex-col justify-center bg-linear-to-br from-side-bg via-side-bg to-side-active px-6 py-8 text-side-ink sm:px-10 lg:order-first lg:sticky lg:top-0 lg:h-dvh lg:overflow-hidden lg:px-10 lg:py-8">
        <div className="max-w-lg">
          <h1 className="font-serif text-4xl font-semibold leading-tight lg:text-5xl">
            Question bank
          </h1>
          <p className="mt-3 text-lg text-side-soft">
            Sign in to find, add and review interview questions.
          </p>
          {!SHOW_DEMO && (
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
          )}
        </div>

        {SHOW_DEMO && (
          <section
            aria-labelledby="demo-heading"
            className="mt-5 max-w-3xl rounded-2xl border border-side-line bg-side-active/40 p-4 sm:p-5"
          >
            <h2 id="demo-heading" className="font-medium">
              Demo accounts
            </h2>
            <p className="mt-1 text-sm text-side-soft">
              Choose one to fill in the email and password. A department grant adds that
              department&apos;s questions on top of the global ones.
            </p>
            <div className="relative mt-3 max-h-96 min-h-40 overflow-auto lg:max-h-[calc(100dvh-24rem)]">
              <table className="w-full text-[13px] leading-tight">
                <caption className="sr-only">
                  Demo accounts, their role and department grants
                </caption>
                <thead>
                  <tr className="border-b border-side-line text-left text-side-soft">
                    <th scope="col" className="sticky top-0 bg-side-bg px-2 py-1.5 font-medium">
                      Account
                    </th>
                    <th scope="col" className="sticky top-0 bg-side-bg px-2 py-1.5 font-medium">
                      Role
                    </th>
                    {['Global', ...DEMO_CLIENTS].map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className="sticky top-0 bg-side-bg px-1 py-1 text-center font-medium"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_ACCOUNTS.map((a) => (
                    <tr key={a.email} className="border-b border-side-line last:border-b-0">
                      <td className="p-0">
                        <button
                          type="button"
                          onClick={() => {
                            setValue('email', a.email, { shouldValidate: true });
                            setValue('password', DEMO_PASSWORD, { shouldValidate: true });
                          }}
                          className="w-full rounded-lg px-2 py-1 text-left hover:bg-side-active"
                        >
                          <span className="block font-medium whitespace-nowrap">{a.label}</span>
                          <span className="text-side-soft">{a.email}</span>
                        </button>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">{a.role}</td>
                      {['Global', ...DEMO_CLIENTS].map((c) => {
                        // Global questions need no grant: every account sees them.
                        const granted =
                          c === 'Global' ||
                          a.seesAll ||
                          (a.grants as readonly string[]).includes(c);
                        return (
                          <td key={c} className="px-1 py-1 text-center">
                            <span
                              aria-hidden="true"
                              className={granted ? 'font-semibold' : 'text-side-soft'}
                            >
                              {granted ? '✓' : '–'}
                            </span>
                            <span className="sr-only">{granted ? 'Has access' : 'No access'}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>

      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {mfaToken ? (
            <MfaStep
              token={mfaToken}
              onRestart={() => setMfaToken(null)}
              onSignedIn={() => navigate(from, { replace: true })}
            />
          ) : (
            <>
              <h2 className="font-serif text-2xl font-semibold">Welcome back</h2>
              <p className="mt-1 text-ink-soft">Use your work email to continue.</p>

              <form
                noValidate
                onSubmit={handleSubmit((v) =>
                  login.mutate(v, {
                    onSuccess: (result) =>
                      'mfaRequired' in result
                        ? setMfaToken(result.mfaToken)
                        : navigate(from, { replace: true }),
                  }),
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
                <Button
                  type="submit"
                  variant="primary"
                  loading={login.isPending}
                  className="w-full"
                >
                  Sign in
                </Button>
              </form>

              <p className="mt-4 text-sm">
                <Link to="/how-it-works" className="font-medium text-accent underline">
                  How access and permissions work
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
