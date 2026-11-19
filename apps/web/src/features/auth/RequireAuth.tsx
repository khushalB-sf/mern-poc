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
  // A password an admin set must be replaced first; nothing else works until it is.
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  // Admins must have two-factor on (when the server requires it): enrolment is the only thing open.
  if (user.mfaEnrollmentRequired && location.pathname !== '/account') {
    return <Navigate to="/account" replace />;
  }
  return <Outlet />;
}
