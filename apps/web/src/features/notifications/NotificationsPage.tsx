import { Link } from 'react-router';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { formatDateTime } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { Page, PageHeader } from '../../shared/ui/Page';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useMarkAllRead, useNotifications } from './hooks';

export function NotificationsPage() {
  useDocumentTitle('Notifications');
  const list = useNotifications();
  const markAll = useMarkAllRead();

  return (
    <Page width="md">
      <PageHeader
        title="Notifications"
        description="What happened to the questions you submitted."
        actions={
          list.data && list.data.unreadCount > 0 ? (
            <Button loading={markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      {list.isPending ? (
        <PageSpinner label="Loading notifications" />
      ) : list.isError ? (
        <ErrorState title="Couldn't load notifications" onRetry={() => void list.refetch()}>
          {list.error.message}
        </ErrorState>
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nothing new">
          When a reviewer approves or rejects one of your questions, you will see it here.
        </EmptyState>
      ) : (
        <ul
          aria-label="Notifications"
          className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm"
        >
          {list.data.items.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm text-ink-soft">
                  {n.type === 'QUESTION_APPROVED'
                    ? 'Your question was approved'
                    : 'Your question was rejected'}
                  {' · '}
                  {formatDateTime(n.at)}
                </p>
                {n.question ? (
                  <Link
                    to={`/questions/${n.question.id}`}
                    className="mt-0.5 block font-medium text-accent underline-offset-2 hover:underline"
                  >
                    {n.question.text}
                  </Link>
                ) : (
                  <p className="mt-0.5 text-ink-soft">
                    That question is no longer available to you.
                  </p>
                )}
              </div>
              {!n.readAt && (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink">
                  New
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
