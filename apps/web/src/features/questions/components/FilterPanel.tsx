import type { Client, TagCategory } from '../../../shared/api/types';
import { STATUS_LABEL } from '../../../shared/lib/format';
import { Button } from '../../../shared/ui/Button';
import { STATUSES, activeFilterCount, toggleTag, type Filters } from '../filters';
import { TagPicker } from './TagPicker';

const STATUS_OPTIONS: { value: Filters['status']; label: string }[] = [
  { value: '', label: 'Any status' },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

interface Props {
  categories: TagCategory[] | undefined;
  clients: Client[] | undefined;
  tagsError: boolean;
  onRetryTags: () => void;
  /** Read-only users only ever see approved questions, so they get no status control. */
  showStatus: boolean;
  filters: Filters;
  onChange: (next: Filters) => void;
}

export function FilterPanel({
  categories,
  clients,
  tagsError,
  onRetryTags,
  showStatus,
  filters,
  onChange,
}: Props) {
  const active = activeFilterCount(filters);
  return (
    <div className="space-y-6 [&_legend]:text-xs [&_legend]:uppercase [&_legend]:tracking-wider [&_legend]:text-ink-soft">
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

      {showStatus && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Review status</legend>
          <div className="flex flex-col">
            {STATUS_OPTIONS.map((o) => (
              <label
                key={o.value || 'any'}
                className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm"
              >
                <input
                  type="radio"
                  name="status-filter"
                  checked={filters.status === o.value}
                  onChange={() => onChange({ ...filters, status: o.value, page: 1 })}
                  className="size-4 accent-[var(--accent)]"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {clients && clients.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Department</legend>
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
          onClick={() => onChange({ ...filters, tags: [], clientId: '', status: '', page: 1 })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
