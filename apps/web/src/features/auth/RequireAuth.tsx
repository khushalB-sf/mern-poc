import { Navigate, Outlet, useLocation } from 'react-router';
import { PageSpinner, ErrorState } from '../../shared/ui/states';
import { useMe } from './hooks';

export function RequireAuth() {
  const { data: user, isPending, isError, refetch } = useMe();
  const location = useLocation();

  if (isPending) return <PageSpinner label="Checking your session" />;
  if (isError) {
    return (
      <ErrorState title="Can't reach the server" onRetry={() => void refetch()}>
        Check your connection and try again.
      </ErrorState>
    );
  }
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
