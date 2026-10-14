import { Link } from 'react-router';
import type { Question } from '../../../shared/api/types';
import { formatDate } from '../../../shared/lib/format';
import { cx } from '../../../shared/ui/cx';
import { ClientBadge, TagChip } from './chips';

export function QuestionRow({
  question: q,
  tagLabel,
}: {
  question: Question;
  tagLabel: (category: string, value: string) => string;
}) {
  return (
    // The amber edge marks client-restricted rows; unrestricted rows keep a transparent edge so text aligns.
    <li
      className={cx(
        'border-l-4 py-5 pl-4',
        q.client ? 'border-restricted-edge' : 'border-transparent',
      )}
    >
      <article>
        <h2 className="font-serif text-xl font-semibold leading-snug">
          <Link to={`/questions/${q.id}`} className="underline-offset-4 hover:underline">
            {q.text}
          </Link>
        </h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {q.client && <ClientBadge name={q.client.name} />}
          {q.tags.map((t) => (
            <TagChip
              key={`${t.category}:${t.value}`}
              category={t.category}
              label={tagLabel(t.category, t.value)}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Added by {q.author.name} on {formatDate(q.createdAt)}
        </p>
        {q.answerNotes && (
          <details className="group mt-2">
            <summary className="w-fit cursor-pointer rounded text-sm font-medium text-accent hover:underline">
              Answer notes
            </summary>
            <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed">
              {q.answerNotes}
            </p>
          </details>
        )}
      </article>
    </li>
  );
}
