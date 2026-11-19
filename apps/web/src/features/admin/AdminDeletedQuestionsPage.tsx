import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { formatDate } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { Page, PageHeader } from '../../shared/ui/Page';
import { EmptyState, ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { useDeletedQuestions, useRestoreQuestion } from './hooks';

export function AdminDeletedQuestionsPage() {
  useDocumentTitle('Deleted questions');
  const deleted = useDeletedQuestions();
  const rows = deleted.data?.pages.flatMap((p) => p.items) ?? [];
  const restore = useRestoreQuestion();
  const toast = useToast();

  return (
    <Page>
      <PageHeader
        title="Deleted questions"
        description="Restoring a question brings it back with its status and history. Newest deletions first."
      />
      {restore.isError && (
        <p role="alert" className="mb-3 text-sm font-medium text-danger">
          {(restore.error as Error).message}
        </p>
      )}
      {deleted.isPending ? (
        <PageSpinner label="Loading deleted questions" />
      ) : deleted.isError ? (
        <ErrorState title="Couldn't load deleted questions" onRetry={() => void deleted.refetch()}>
          {deleted.error.message}
        </ErrorState>
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing deleted">Deleted questions will show up here.</EmptyState>
      ) : (
        <ul
          aria-label="Deleted questions"
          className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm"
        >
          {rows.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-medium">{q.text}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {q.department?.name ?? 'Global'} · by {q.author.name} · deleted{' '}
                  {formatDate(q.deletedAt)}
                </p>
                {q.departmentDeleted && (
                  <p className="mt-1 text-sm text-danger">
                    Its department is deleted. Restore {q.department?.name} first.
                  </p>
                )}
              </div>
              <Button
                size="sm"
                disabled={q.departmentDeleted}
                loading={restore.isPending && restore.variables === q.id}
                aria-label={`Restore question: ${q.text}`}
                onClick={() =>
                  restore.mutate(q.id, { onSuccess: () => toast('Question restored') })
                }
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      {deleted.hasNextPage && (
        <div className="mt-4 text-center">
          <Button loading={deleted.isFetchingNextPage} onClick={() => void deleted.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </Page>
  );
}
