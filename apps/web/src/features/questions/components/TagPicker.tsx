import { useId } from 'react';
import type { TagCategory } from '../../../shared/api/types';

interface Props {
  categories: TagCategory[];
  selected: string[];
  onToggle: (tag: string) => void;
}

/** One fieldset per category with real checkboxes: keyboard and screen-reader friendly by default. */
export function TagPicker({ categories, selected, onToggle }: Props) {
  const prefix = useId();
  return (
    <div className="space-y-6">
      {categories.map((c) => (
        <fieldset key={c.slug}>
          <legend className="mb-1.5 text-sm font-semibold">{c.name}</legend>
          <div className="flex flex-wrap gap-2">
            {c.tags.map((t) => {
              const tag = `${c.slug}:${t.value}`;
              // A retired technology is not offered, unless the question already carries it.
              if (t.retired && !selected.includes(tag)) return null;
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
                  {t.retired && <span className="text-xs text-ink-soft">(retired)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
