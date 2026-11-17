import { useState } from 'react';
import { ApiError } from '../../../shared/api/client';
import { Button } from '../../../shared/ui/Button';
import { TextAreaField } from '../../../shared/ui/Field';
import { useToast } from '../../../shared/ui/Toast';
import { useReviewQuestion } from '../hooks';

const NOTE_MAX = 2000;

function explain(e: unknown) {
  if (e instanceof ApiError && e.status === 409) {
    return 'Someone else already reviewed this question. Reload to see their decision.';
  }
  if (e instanceof ApiError && e.status === 403)
    return 'You are not allowed to review this question.';
  return e instanceof ApiError ? e.message : "We couldn't save your decision. Try again.";
}

/** Approve or reject a pending question. A note is optional for approval and required for rejection. */
export function ReviewPanel({
  questionId,
  redecide = false,
}: {
  questionId: string;
  /** An admin can change a decision that was already made. */
  redecide?: boolean;
}) {
  const review = useReviewQuestion(questionId);
  const toast = useToast();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string>();

  const decide = (decision: 'APPROVED' | 'REJECTED') => {
    const trimmed = note.trim();
    if (decision === 'REJECTED' && !trimmed) {
      setNoteError('Tell the author why you are rejecting this question');
      return;
    }
    setNoteError(undefined);
    review.mutate(
      { decision, note: trimmed },
      {
        onSuccess: () => toast(decision === 'APPROVED' ? 'Question approved' : 'Question rejected'),
      },
    );
  };

  return (
    <section
      aria-labelledby="review-heading"
      className="mt-6 rounded-xl border border-pending-ink/30 bg-pending-bg/40 p-5 shadow-sm"
    >
      <h2 id="review-heading" className="text-lg font-semibold">
        {redecide ? 'Change the decision' : 'Review this question'}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Approving makes it visible to everyone with access. Rejecting sends it back to the author
        with your note.
      </p>
      {review.isError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {explain(review.error)}
        </p>
      )}
      <TextAreaField
        className="mt-4"
        label="Note"
        hint="Required when rejecting, optional when approving."
        rows={3}
        maxLength={NOTE_MAX}
        counter={`${note.length.toLocaleString()} / ${NOTE_MAX.toLocaleString()}`}
        error={noteError}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={review.isPending && review.variables?.decision === 'APPROVED'}
          disabled={review.isPending}
          onClick={() => decide('APPROVED')}
        >
          Approve
        </Button>
        <Button
          variant="danger"
          loading={review.isPending && review.variables?.decision === 'REJECTED'}
          disabled={review.isPending}
          onClick={() => decide('REJECTED')}
        >
          Reject
        </Button>
      </div>
    </section>
  );
}
