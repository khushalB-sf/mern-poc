import { useId } from 'react';
import type { TagCategory } from '../../../shared/api/types';

interface Props {
  categories: TagCategory[];
  selected: string[];
  onToggle: (tag: string) => void;
  /** Smaller, tighter rows for the filter rail. */
  compact?: boolean;
}

/** One fieldset per category with real checkboxes: keyboard and screen-reader friendly by default. */
export function TagPicker({ categories, selected, onToggle, compact = false }: Props) {
  const prefix = useId();
  return (
    <div className={compact ? 'space-y-5' : 'space-y-6'}>
      {categories.map((c) => (
        <fieldset key={c.slug}>
          <legend className="mb-1.5 text-sm font-semibold">{c.name}</legend>
          <div className={compact ? 'flex flex-col' : 'flex flex-wrap gap-2'}>
            {c.tags.map((t) => {
              const tag = `${c.slug}:${t.value}`;
              const id = `${prefix}-${tag}`;
              return compact ? (
                <label
                  key={tag}
                  htmlFor={id}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm"
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={selected.includes(tag)}
                    onChange={() => onToggle(tag)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {t.label}
                </label>
              ) : (
                <label
                  key={tag}
                  htmlFor={id}
                  className="has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-control bg-surface px-3 text-sm"
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
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
