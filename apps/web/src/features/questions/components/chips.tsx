import type { TagCategory } from '../../../shared/api/types';
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs">
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
      <span className="sr-only">Restricted to client: </span>
      {name} only
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
