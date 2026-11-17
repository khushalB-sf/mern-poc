import type { QuestionStatus, TagCategory } from '../../../shared/api/types';
import { STATUS_LABEL } from '../../../shared/lib/format';
import { Icon } from '../../../shared/ui/Icon';
import { cx } from '../../../shared/ui/cx';

// Literal class names so Tailwind can see them. The dot colour encodes the category.
const DOT: Record<string, string> = {
  technology: 'bg-[var(--cat-technology)]',
  seniority: 'bg-[var(--cat-seniority)]',
  type: 'bg-[var(--cat-type)]',
};

export function TagChip({ category, label }: { category: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium">
      <span
        aria-hidden="true"
        className={cx('size-2 rounded-full', DOT[category] ?? 'bg-control')}
      />
      <span className="sr-only">{category}: </span>
      {label}
    </span>
  );
}

/** The one amber element in the interface: access to this question depends on a client grant. */
export function ClientBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-restricted-bg px-2.5 py-0.5 text-xs font-medium text-restricted-ink">
      <Icon name="lock" className="size-3" />
      <span className="sr-only">Restricted to department: </span>
      {name} only
    </span>
  );
}

// Text always carries the meaning; colour only reinforces it.
const STATUS_ICON = { PENDING: 'clock', APPROVED: 'check', REJECTED: 'x' } as const;

const STATUS_STYLE: Record<QuestionStatus, string> = {
  PENDING: 'bg-pending-bg text-pending-ink',
  APPROVED: 'bg-ok-bg text-ok',
  REJECTED: 'bg-danger-bg text-danger',
};

export function StatusBadge({ status }: { status: QuestionStatus }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLE[status],
      )}
    >
      <Icon name={STATUS_ICON[status]} className="size-3" />
      <span className="sr-only">Status: </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** value -> label lookup built from the tag taxonomy, falling back to the raw value. */
export function labelLookup(categories: TagCategory[] | undefined) {
  const map = new Map<string, string>();
  for (const c of categories ?? [])
    for (const t of c.tags) map.set(`${c.slug}:${t.value}`, t.label);
  return (category: string, value: string) => map.get(`${category}:${value}`) ?? value;
}
