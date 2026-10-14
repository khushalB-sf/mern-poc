import type { DuplicateMatch } from '../../../shared/api/types';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';

const MAX_SHOWN = 3;

/** Similarity as a bar. SVG attributes (not inline styles) so it works under a strict CSP. */
function SimilarityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <svg
        role="img"
        aria-label={`${pct}% similar`}
        viewBox="0 0 100 6"
        className="h-1.5 w-24 shrink-0"
      >
        <rect width="100" height="6" rx="3" className="fill-line" />
        <rect width={pct} height="6" rx="3" className="fill-accent" />
      </svg>
      <span className="text-sm font-medium">{pct}% similar</span>
    </div>
  );
}

interface Props {
  open: boolean;
  yourText: string;
  matches: DuplicateMatch[];
  submitting: boolean;
  onEdit: () => void;
  onSubmitAnyway: () => void;
}

export function DuplicateDialog({
  open,
  yourText,
  matches,
  submitting,
  onEdit,
  onSubmitAnyway,
}: Props) {
  const shown = matches.slice(0, MAX_SHOWN);
  return (
    <Dialog
      open={open}
      onClose={onEdit}
      title="This looks like a question we already have"
      size="lg"
    >
      <p className="text-ink-soft">
        Check the closest {shown.length === 1 ? 'match' : 'matches'} before you add yours. Adding
        near-duplicates makes the bank harder to search.
      </p>

      <ul className="mt-5 space-y-5">
        {shown.map((m) => (
          <li key={m.id} className="rounded-md border border-line p-4">
            <SimilarityBar value={m.similarity} />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-semibold">Your question</p>
                <p className="font-serif text-lg leading-snug">{yourText}</p>
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold">Already in the bank</p>
                <p className="font-serif text-lg leading-snug">{m.text}</p>
                <a
                  href={`/questions/${m.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-medium text-accent underline underline-offset-4"
                >
                  Open it in a new tab
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {matches.length > shown.length && (
        <p className="mt-3 text-sm text-ink-soft">
          And {matches.length - shown.length} more similar questions.
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onSubmitAnyway} loading={submitting}>
          It's different, add it anyway
        </Button>
        <Button variant="primary" onClick={onEdit} disabled={submitting}>
          Go back and edit
        </Button>
      </div>
    </Dialog>
  );
}
