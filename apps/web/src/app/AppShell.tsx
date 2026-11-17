import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Button, buttonClass } from '../shared/ui/Button';
import { Avatar } from '../shared/ui/Avatar';
import { Icon, type IconName } from '../shared/ui/Icon';
import { cx } from '../shared/ui/cx';
import { ROLE_LABEL } from '../shared/lib/format';
import { isAdmin, useLogout, useMe } from '../features/auth/hooks';

function SideLink({
  to,
  icon,
  end,
  children,
}: {
  to: string;
  icon: IconName;
  end?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end ?? false}
      className={({ isActive }) =>
        cx(
          'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          'focus-visible:outline-side-ring',
          isActive
            ? 'bg-side-active text-side-ink'
            : 'text-side-soft hover:bg-side-active/60 hover:text-side-ink',
        )
      }
    >
      <Icon name={icon} className="size-5 shrink-0" />
      {children}
    </NavLink>
  );
}

export function AppShell() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // After navigating, move focus to the content so keyboard and screen-reader users start there.
  useEffect(() => {
    setMenuOpen(false);
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
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {/* One element, two layouts: a top bar with a collapsible menu on phones, a fixed rail from `lg` up. */}
      <header className="sticky top-0 z-30 bg-side-bg text-side-ink lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-side-line">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
          <Link
            to="/"
            className="whitespace-nowrap font-serif text-lg font-semibold focus-visible:outline-side-ring"
          >
            Question bank
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="app-nav"
            aria-label="Menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-side-soft hover:bg-side-active/60 hover:text-side-ink focus-visible:outline-side-ring lg:hidden"
          >
            <Icon name={menuOpen ? 'x' : 'menu'} className="size-6" />
          </button>
        </div>

        <div
          id="app-nav"
          className={cx(
            'max-h-[calc(100dvh-4.5rem)] flex-1 flex-col overflow-y-auto px-3 pb-4 lg:flex lg:max-h-none lg:pb-5',
            menuOpen ? 'flex' : 'hidden',
          )}
        >
          <nav aria-label="Main" className="space-y-1">
            {me && (
              <SideLink to="/" icon="list" end>
                Questions
              </SideLink>
            )}
            <SideLink to="/how-it-works" icon="info">
              How it works
            </SideLink>
          </nav>

          {me && isAdmin(me) && (
            <nav aria-labelledby="admin-nav-label" className="mt-6 space-y-1">
              <p
                id="admin-nav-label"
                className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-side-soft"
              >
                Admin
              </p>
              <SideLink to="/admin/users" icon="users">
                Users
              </SideLink>
              <SideLink to="/admin/departments" icon="building">
                Departments
              </SideLink>
              <SideLink to="/admin/deleted-questions" icon="trash">
                Deleted questions
              </SideLink>
            </nav>
          )}

          <div className="mt-auto pt-6">
            {me && (
              <div className="rounded-xl border border-side-line p-3">
                <div className="flex items-center gap-3">
                  <Avatar name={me.name} className="size-10 bg-side-active text-side-ink" />
                  <div className="min-w-0 text-sm leading-tight">
                    <p className="truncate font-medium">{me.name}</p>
                    <p className="text-side-soft">{ROLE_LABEL[me.role]}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Sign out"
                  className="mt-3 w-full justify-start text-side-soft hover:bg-side-active/60 hover:text-side-ink focus-visible:outline-side-ring"
                  loading={logout.isPending}
                  onClick={() =>
                    logout.mutate(undefined, {
                      onSettled: () => navigate('/login', { replace: true }),
                    })
                  }
                >
                  <Icon name="logout" />
                  Sign out
                </Button>
              </div>
            )}
            {/* null = checked and signed out; undefined = still checking, so show nothing yet. */}
            {me === null && (
              <Link
                to="/login"
                className={cx(buttonClass('primary'), 'w-full focus-visible:outline-side-ring')}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="outline-none lg:min-h-dvh lg:pl-64">
        <Outlet />
      </main>
    </>
  );
}
