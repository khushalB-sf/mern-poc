import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { formatDate } from '../../shared/lib/format';
import { Button, buttonClass } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Avatar } from '../../shared/ui/Avatar';
import { Icon } from '../../shared/ui/Icon';
import { Page } from '../../shared/ui/Page';
import { ErrorState, PageSpinner } from '../../shared/ui/states';
import { useToast } from '../../shared/ui/Toast';
import { canDelete, canEdit, canReview, isAdmin, useMe } from '../auth/hooks';
import { HistoryList } from './components/HistoryList';
import { ReviewPanel } from './components/ReviewPanel';
import { ClientBadge, StatusBadge, TagChip, labelLookup } from './components/chips';
import { useDeleteQuestion, useHistory, useQuestion, useTags } from './hooks';

export function QuestionDetailPage() {
  const { id = '' } = useParams();
  const { data: me } = useMe();
  const question = useQuestion(id);
  const history = useHistory(id);
  const tags = useTags();
  const remove = useDeleteQuestion(id);
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  useDocumentTitle(question.data ? question.data.text.slice(0, 60) : 'Question');

  if (question.isPending) return <PageSpinner label="Loading question" />;

  if (question.isError) {
    // 404 covers both "doesn't exist" and "you may not see it": the page must not tell them apart either.
    const notFound =
      question.error instanceof ApiError &&
      (question.error.status === 404 || question.error.status === 400);
    return (
      <Page width="md">
        <ErrorState
          title={notFound ? "We can't find that question" : "Couldn't load the question"}
          onRetry={notFound ? undefined : () => void question.refetch()}
        >
          {notFound
            ? 'It may have been removed, or you may not have access to it.'
            : question.error.message}
        </ErrorState>
        <p className="mt-4 text-center">
          <Link to="/" className={buttonClass('secondary')}>
            Back to all questions
          </Link>
        </p>
      </Page>
    );
  }

  const q = question.data;
  const tagLabel = labelLookup(tags.data);

  return (
    <Page>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        <Icon name="chevronLeft" />
        All questions
      </Link>

      <div className="mt-4 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <article
            className={
              'rounded-xl border border-l-4 border-line bg-surface p-5 shadow-sm sm:p-7 ' +
              (q.client ? 'border-l-restricted-edge' : '')
            }
          >
            <h1 className="font-serif text-3xl font-semibold leading-snug">{q.text}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={q.status} />
              {q.client && <ClientBadge name={q.client.name} />}
              {q.tags.map((t) => (
                <TagChip
                  key={`${t.category}:${t.value}`}
                  category={t.category}
                  label={tagLabel(t.category, t.value)}
                />
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2.5 text-sm text-ink-soft">
              <Avatar name={q.author.name} />
              <span>
                Added by {q.author.name} on {formatDate(q.createdAt)}
                {q.updatedAt !== q.createdAt && `, last edited ${formatDate(q.updatedAt)}`}
              </span>
            </p>

            {q.review && (
              <section
                aria-labelledby="decision"
                className={
                  'mt-5 rounded-lg border px-4 py-3 text-sm ' +
                  (q.status === 'REJECTED'
                    ? 'border-danger/40 bg-danger-bg'
                    : 'border-ok/40 bg-ok-bg')
                }
              >
                <h2 id="decision" className="font-semibold">
                  {q.status === 'REJECTED' ? 'Rejected' : 'Approved'} by {q.review.reviewer.name} on{' '}
                  {formatDate(q.review.at)}
                </h2>
                {q.review.note && <p className="mt-1 whitespace-pre-wrap">{q.review.note}</p>}
              </section>
            )}

            {me && (canEdit(me, q) || canDelete(me)) && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                {canEdit(me, q) && (
                  <Link to={`/questions/${q.id}/edit`} className={buttonClass('secondary')}>
                    <Icon name="edit" />
                    Edit question
                  </Link>
                )}
                {canDelete(me) && (
                  <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                    Delete question
                  </Button>
                )}
                {canEdit(me, q) && !isAdmin(me) && q.status !== 'PENDING' && (
                  <span className="text-sm text-ink-soft">
                    Saving changes sends it back for review.
                  </span>
                )}
              </div>
            )}
          </article>

          {me && canReview(me, q) && (
            <ReviewPanel questionId={q.id} redecide={q.status !== 'PENDING'} />
          )}

          <section
            aria-labelledby="notes"
            className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-7"
          >
            <h2 id="notes" className="mb-3 font-serif text-xl font-semibold">
              Answer notes
            </h2>
            {q.answerNotes ? (
              <p className="max-w-[68ch] whitespace-pre-wrap leading-relaxed">{q.answerNotes}</p>
            ) : (
              <p className="text-ink-soft">No answer notes yet.</p>
            )}
          </section>
        </div>

        <section
          aria-labelledby="history"
          className="rounded-xl border border-line bg-surface p-5 shadow-sm xl:sticky xl:top-6"
        >
          <h2 id="history" className="mb-4 font-serif text-xl font-semibold">
            History
          </h2>
          {history.isPending ? (
            <p className="text-sm text-ink-soft">Loading history</p>
          ) : history.isError ? (
            <p role="alert" className="text-sm text-danger">
              Couldn't load the history.{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => void history.refetch()}
              >
                Try again
              </button>
            </p>
          ) : (
            <HistoryList items={history.data} />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this question?"
        confirmLabel="Delete question"
        loading={remove.isPending}
        error={remove.isError ? remove.error.message : undefined}
        onClose={() => {
          remove.reset();
          setConfirmDelete(false);
        }}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast('Question deleted');
              navigate('/');
            },
          })
        }
      >
        <p>It disappears from every list and search. Its history is kept for the audit trail.</p>
      </ConfirmDialog>
    </Page>
  );
}
