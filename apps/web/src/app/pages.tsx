import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { buttonClass } from '../shared/ui/Button';
import { EmptyState, ErrorState } from '../shared/ui/states';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <EmptyState
        title="That page doesn't exist"
        action={
          <Link to="/" className={buttonClass('primary')}>
            Go to all questions
          </Link>
        }
      >
        Check the address, or head back to the question list.
      </EmptyState>
    </div>
  );
}

/** Catches rendering errors so one broken screen never leaves a blank page. */
export function RouteError() {
  const error = useRouteError();
  useDocumentTitle('Something went wrong');
  console.error(error);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ErrorState title="Something went wrong">
        {isRouteErrorResponse(error)
          ? `${error.status} ${error.statusText}`
          : 'An unexpected error stopped this page from loading.'}
      </ErrorState>
      <p className="text-center">
        <a href="/" className={buttonClass('secondary')}>
          Reload the app
        </a>
      </p>
    </div>
  );
}
