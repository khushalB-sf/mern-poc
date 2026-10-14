import { Link, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { formatDate } from '../../shared/lib/format';
import { buttonClass } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { ErrorState, PageSpinner } from '../../shared/ui/states';
import { canEdit, useMe } from '../auth/hooks';
import { HistoryList } from './components/HistoryList';
import { ClientBadge, TagChip, labelLookup } from './components/chips';
import { useHistory, useQuestion, useTags } from './hooks';

export function QuestionDetailPage() {
  const { id = '' } = useParams();
  const { data: me } = useMe();
  const question = useQuestion(id);
  const history = useHistory(id);
  const tags = useTags();
  useDocumentTitle(question.data ? question.data.text.slice(0, 60) : 'Question');

  if (question.isPending) return <PageSpinner label="Loading question" />;

  if (question.isError) {
    // 404 covers both "doesn't exist" and "you may not see it": the page must not tell them apart either.
    const notFound =
      question.error instanceof ApiError &&
      (question.error.status === 404 || question.error.status === 400);
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorState
          title={notFound ? "We can't find that question" : "Couldn't load the question"}
          onRetry={notFound ? undefined : () => void question.refetch()}
        >
          {notFound
            ? 'It may have been removed, or you may not have access to it.'
            : question.error.message}
        </ErrorState>
        <p className="text-center">
          <Link to="/" className={buttonClass('secondary')}>
            Back to all questions
          </Link>
        </p>
      </div>
    );
  }

  const q = question.data;
  const tagLabel = labelLookup(tags.data);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        <Icon name="chevronLeft" />
        All questions
      </Link>

      <article className={q.client ? 'mt-4 border-l-4 border-restricted-edge pl-4' : 'mt-4'}>
        <h1 className="font-serif text-3xl font-semibold leading-snug">{q.text}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {q.client && <ClientBadge name={q.client.name} />}
          {q.tags.map((t) => (
            <TagChip
              key={`${t.category}:${t.value}`}
              category={t.category}
              label={tagLabel(t.category, t.value)}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Added by {q.author.name} on {formatDate(q.createdAt)}
          {q.updatedAt !== q.createdAt && `, last edited ${formatDate(q.updatedAt)}`}
        </p>

        {me && canEdit(me, q) && (
          <p className="mt-4">
            <Link to={`/questions/${q.id}/edit`} className={buttonClass('secondary')}>
              <Icon name="edit" />
              Edit question
            </Link>
          </p>
        )}

        <section aria-labelledby="notes" className="mt-8">
          <h2 id="notes" className="mb-2 text-lg font-semibold">
            Answer notes
          </h2>
          {q.answerNotes ? (
            <p className="max-w-[68ch] whitespace-pre-wrap leading-relaxed">{q.answerNotes}</p>
          ) : (
            <p className="text-ink-soft">No answer notes yet.</p>
          )}
        </section>
      </article>

      <section aria-labelledby="history" className="mt-10 border-t border-line pt-6">
        <h2 id="history" className="mb-3 text-lg font-semibold">
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
  );
}
