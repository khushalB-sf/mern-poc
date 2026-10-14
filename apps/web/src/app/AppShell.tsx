import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { Button, buttonClass } from '../shared/ui/Button';
import { Icon } from '../shared/ui/Icon';
import { cx } from '../shared/ui/cx';
import { ROLE_LABEL } from '../shared/lib/format';
import { canCreate, useLogout, useMe } from '../features/auth/hooks';

export function AppShell() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  // After navigating, move focus to the content so keyboard and screen-reader users start there.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="whitespace-nowrap font-serif text-lg font-semibold sm:text-xl">
            Question bank
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            {me && canCreate(me) && (
              <Link
                to="/questions/new"
                className={cx(buttonClass('primary', 'sm'), 'whitespace-nowrap')}
              >
                <Icon name="plus" />
                Add question
              </Link>
            )}
            {me && (
              <div className="hidden text-right text-sm leading-tight sm:block">
                <p className="font-medium">{me.name}</p>
                <p className="text-ink-soft">{ROLE_LABEL[me.role]}</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Sign out"
              className="whitespace-nowrap"
              loading={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })
              }
            >
              <Icon name="logout" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
    </>
  );
}
