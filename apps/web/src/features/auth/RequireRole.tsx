import { Link, Outlet } from 'react-router';
import type { Role } from '../../shared/api/types';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { buttonClass } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/states';
import { useMe } from './hooks';

/** Route gate for role-only screens. Nest it inside RequireAuth; the API enforces the same rule. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { data: me } = useMe();
  useDocumentTitle('No access');
  if (me && roles.includes(me.role)) return <Outlet />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <EmptyState
        title="You don't have access to this page"
        action={
          <Link to="/" className={buttonClass('primary')}>
            Go to all questions
          </Link>
        }
      >
        This area is for {roles.map((r) => r.toLowerCase()).join(' or ')} accounts only.
      </EmptyState>
    </div>
  );
}
