import { useId } from 'react';
import type { TagCategory } from '../../../shared/api/types';

type Tag = TagCategory['tags'][number];

interface Props {
  categories: TagCategory[];
  selected: string[];
  onToggle: (tag: string) => void;
  /** Technology values offered for the chosen department; null offers every active technology. */
  technologies?: ReadonlySet<string> | null;
}

/**
 * One fieldset per category with real checkboxes: keyboard and screen-reader friendly by default.
 * Technologies no department uses are grouped under "Other".
 */
export function TagPicker({ categories, selected, onToggle, technologies = null }: Props) {
  const prefix = useId();

  const pill = (slug: string, t: Tag) => {
    const tag = `${slug}:${t.value}`;
    const id = `${prefix}-${tag}`;
    return (
      <label
        key={tag}
        htmlFor={id}
        className="has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-medium has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-control bg-surface px-3 text-sm transition-colors hover:border-ink-soft"
      >
        <input
          id={id}
          type="checkbox"
          checked={selected.includes(tag)}
          onChange={() => onToggle(tag)}
          className="sr-only"
        />
        {selected.includes(tag) && <span aria-hidden="true">✓</span>}
        {t.label}
        {t.archived && <span className="text-xs text-ink-soft">(archived)</span>}
      </label>
    );
  };

  return (
    <div className="space-y-6">
      {categories.map((c) => {
        // Archived tags, and technologies outside the department, are offered only while already selected.
        const shown = c.tags.filter((t) => {
          const hidden =
            t.archived || (c.slug === 'technology' && technologies && !technologies.has(t.value));
          return !hidden || selected.includes(`${c.slug}:${t.value}`);
        });
        const main = shown.filter((t) => !t.other);
        const other = shown.filter((t) => t.other);
        return (
          <fieldset key={c.slug}>
            <legend className="mb-1.5 text-sm font-semibold">{c.name}</legend>
            <div className="flex flex-wrap gap-2">{main.map((t) => pill(c.slug, t))}</div>
            {other.length > 0 && (
              <fieldset className={main.length > 0 ? 'mt-3' : ''}>
                <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                  Other
                </legend>
                <div className="flex flex-wrap gap-2">{other.map((t) => pill(c.slug, t))}</div>
              </fieldset>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
