import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Page } from '../shared/ui/Page';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { buttonClass } from '../shared/ui/Button';
import { EmptyState, ErrorState } from '../shared/ui/states';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <Page width="md">
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
    </Page>
  );
}

/** Catches rendering errors so one broken screen never leaves a blank page. */
export function RouteError() {
  const error = useRouteError();
  useDocumentTitle('Something went wrong');
  console.error(error);
  return (
    <Page width="md">
      <ErrorState title="Something went wrong">
        {isRouteErrorResponse(error)
          ? `${error.status} ${error.statusText}`
          : 'An unexpected error stopped this page from loading.'}
      </ErrorState>
      <p className="mt-4 text-center">
        <a href="/" className={buttonClass('secondary')}>
          Reload the app
        </a>
      </p>
    </Page>
  );
}
