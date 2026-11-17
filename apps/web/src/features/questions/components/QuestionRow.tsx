import { Link } from 'react-router';
import type { Question } from '../../../shared/api/types';
import { formatDate } from '../../../shared/lib/format';
import { Avatar } from '../../../shared/ui/Avatar';
import { cx } from '../../../shared/ui/cx';
import { ClientBadge, StatusBadge, TagChip } from './chips';

export function QuestionRow({
  question: q,
  tagLabel,
}: {
  question: Question;
  tagLabel: (category: string, value: string) => string;
}) {
  return (
    // The whole card is clickable through the title link's stretched ::after. The amber edge marks
    // client-restricted rows. Answer notes sit above the stretched link so they stay usable.
    <li
      className={cx(
        'group relative rounded-xl border border-l-4 border-line bg-surface p-5 shadow-sm transition-[border-color,box-shadow] hover:border-control hover:shadow-md',
        q.client && 'border-l-restricted-edge',
      )}
    >
      <article>
        <h2 className="font-serif text-xl font-semibold leading-snug">
          <Link
            to={`/questions/${q.id}`}
            className="decoration-accent underline-offset-4 after:absolute after:inset-0 after:rounded-xl group-hover:underline focus-visible:after:outline-2 focus-visible:after:outline-accent"
          >
            {q.text}
          </Link>
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
          <Avatar name={q.author.name} className="size-6 text-[0.65rem]" />
          Added by {q.author.name} on {formatDate(q.createdAt)}
        </p>
        {q.answerNotes && (
          <details className="relative z-10 mt-3 w-fit max-w-full">
            <summary className="w-fit cursor-pointer rounded text-sm font-medium text-accent hover:underline">
              Answer notes
            </summary>
            <p className="mt-2 max-w-[68ch] whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
              {q.answerNotes}
            </p>
          </details>
        )}
      </article>
    </li>
  );
}
