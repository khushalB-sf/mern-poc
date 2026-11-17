import type { HistoryItem } from '../../../shared/api/types';
import { formatDateTime } from '../../../shared/lib/format';
import { Icon } from '../../../shared/ui/Icon';

const FIELD_LABEL: Record<string, string> = {
  text: 'question',
  answerNotes: 'answer notes',
  tags: 'tags',
};

function describe(item: HistoryItem): string {
  switch (item.type) {
    case 'QUESTION_CREATED':
      return `Added by ${item.actor.name}`;
    case 'QUESTION_UPDATED': {
      const fields = Object.keys(item.changes ?? {}).map((k) => FIELD_LABEL[k] ?? k);
      return `Edited by ${item.actor.name}${fields.length ? `: changed ${fields.join(', ')}` : ''}`;
    }
    case 'DUPLICATE_OVERRIDDEN':
      return `${item.actor.name} confirmed this is not a duplicate`;
    case 'QUESTION_APPROVED':
      return `Approved by ${item.actor.name}`;
    case 'QUESTION_REJECTED':
      return `Rejected by ${item.actor.name}`;
  }
}

/** Newest first. Each entry says who did what and when. */
export function HistoryList({ items }: { items: HistoryItem[] }) {
  return (
    <ol className="relative space-y-5 before:absolute before:inset-y-2 before:left-[0.9rem] before:w-px before:bg-line">
      {[...items].reverse().map((item) => (
        <li key={item.id} className="relative flex gap-3 text-sm">
          <span
            aria-hidden="true"
            className="z-10 flex size-[1.85rem] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft"
          >
            <Icon name="history" className="size-3.5" />
          </span>
          <div className="min-w-0 pt-1">
            <p>{describe(item)}</p>
            {item.note && <p className="text-ink-soft">“{item.note}”</p>}
            <time dateTime={item.at} className="text-ink-soft">
              {formatDateTime(item.at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
