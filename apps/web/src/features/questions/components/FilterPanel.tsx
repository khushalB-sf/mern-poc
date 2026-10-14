import type { Client, TagCategory } from '../../../shared/api/types';
import { Button } from '../../../shared/ui/Button';
import { activeFilterCount, toggleTag, type Filters } from '../filters';
import { TagPicker } from './TagPicker';

interface Props {
  categories: TagCategory[] | undefined;
  clients: Client[] | undefined;
  tagsError: boolean;
  onRetryTags: () => void;
  filters: Filters;
  onChange: (next: Filters) => void;
}

export function FilterPanel({
  categories,
  clients,
  tagsError,
  onRetryTags,
  filters,
  onChange,
}: Props) {
  const active = activeFilterCount(filters);
  return (
    <div className="space-y-6">
      {tagsError ? (
        <p role="alert" className="text-sm text-danger">
          Filters didn't load.{' '}
          <button type="button" onClick={onRetryTags} className="font-medium underline">
            Try again
          </button>
        </p>
      ) : !categories ? (
        <div aria-hidden="true" className="animate-pulse space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-2/3 rounded bg-line" />
          ))}
        </div>
      ) : (
        <TagPicker
          compact
          categories={categories}
          selected={filters.tags}
          onToggle={(tag) => onChange(toggleTag(filters, tag))}
        />
      )}

      {clients && clients.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Client</legend>
          <div className="flex flex-col">
            {[
              { id: '', name: 'All questions' },
              ...clients.map((c) => ({ id: c.id, name: `${c.name} only` })),
            ].map((c) => (
              <label
                key={c.id || 'all'}
                className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm"
              >
                <input
                  type="radio"
                  name="client-filter"
                  checked={filters.clientId === c.id}
                  onChange={() => onChange({ ...filters, clientId: c.id, page: 1 })}
                  className="size-4 accent-[var(--accent)]"
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {active > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ ...filters, tags: [], clientId: '', page: 1 })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
