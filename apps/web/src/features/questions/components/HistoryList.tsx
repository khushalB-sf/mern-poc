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
  }
}

/** Newest first. Each entry says who did what and when. */
export function HistoryList({ items }: { items: HistoryItem[] }) {
  return (
    <ol className="space-y-3">
      {[...items].reverse().map((item) => (
        <li key={item.id} className="flex gap-3 text-sm">
          <Icon name="history" className="mt-0.5 shrink-0 text-ink-soft" />
          <div>
            <p>{describe(item)}</p>
            <time dateTime={item.at} className="text-ink-soft">
              {formatDateTime(item.at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
