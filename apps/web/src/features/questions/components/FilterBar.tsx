import type { ReactNode } from 'react';
import type { Client, TagCategory } from '../../../shared/api/types';
import { STATUS_LABEL } from '../../../shared/lib/format';
import { Dropdown } from '../../../shared/ui/Dropdown';
import { STATUSES, toggleTag, type Filters } from '../filters';

const STATUS_OPTIONS: { value: Filters['status']; label: string }[] = [
  { value: '', label: 'Any status' },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

const OPTION =
  'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-surface-2';
const INPUT = 'size-4 accent-[var(--accent)]';

function Option({ children }: { children: ReactNode }) {
  return <label className={OPTION}>{children}</label>;
}

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

/** One dropdown per tag category, plus review status and department, in a row above the results. */
export function FilterBar({
  categories,
  clients,
  tagsError,
  onRetryTags,
  showStatus,
  filters,
  onChange,
}: Props) {
  return (
    <div role="group" aria-label="Filters" className="relative flex flex-wrap items-center gap-2">
      {tagsError ? (
        <p role="alert" className="text-sm text-danger">
          Filters didn't load.{' '}
          <button type="button" onClick={onRetryTags} className="font-medium underline">
            Try again
          </button>
        </p>
      ) : !categories ? (
        <div aria-hidden="true" className="flex animate-pulse gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 w-28 rounded-lg bg-line" />
          ))}
        </div>
      ) : (
        categories.map((c) => (
          <Dropdown
            key={c.slug}
            label={c.name}
            count={filters.tags.filter((t) => t.startsWith(`${c.slug}:`)).length}
          >
            <fieldset>
              <legend className="sr-only">{c.name}</legend>
              {c.tags.map((t) => {
                const tag = `${c.slug}:${t.value}`;
                return (
                  <Option key={tag}>
                    <input
                      type="checkbox"
                      checked={filters.tags.includes(tag)}
                      onChange={() => onChange(toggleTag(filters, tag))}
                      className={INPUT}
                    />
                    {t.label}
                  </Option>
                );
              })}
            </fieldset>
          </Dropdown>
        ))
      )}

      {showStatus && (
        <Dropdown
          label="Review status"
          closeOnChange
          value={filters.status ? STATUS_LABEL[filters.status] : ''}
        >
          <fieldset>
            <legend className="sr-only">Review status</legend>
            {STATUS_OPTIONS.map((o) => (
              <Option key={o.value || 'any'}>
                <input
                  type="radio"
                  name="status-filter"
                  checked={filters.status === o.value}
                  onChange={() => onChange({ ...filters, status: o.value, page: 1 })}
                  className={INPUT}
                />
                {o.label}
              </Option>
            ))}
          </fieldset>
        </Dropdown>
      )}

      {clients && clients.length > 0 && (
        <Dropdown
          label="Department"
          closeOnChange
          value={clients.find((c) => c.id === filters.clientId)?.name ?? ''}
        >
          <fieldset>
            <legend className="sr-only">Department</legend>
            {[
              { id: '', name: 'All questions' },
              ...clients.map((c) => ({ id: c.id, name: `${c.name} only` })),
            ].map((c) => (
              <Option key={c.id || 'all'}>
                <input
                  type="radio"
                  name="client-filter"
                  checked={filters.clientId === c.id}
                  onChange={() => onChange({ ...filters, clientId: c.id, page: 1 })}
                  className={INPUT}
                />
                {c.name}
              </Option>
            ))}
          </fieldset>
        </Dropdown>
      )}
    </div>
  );
}
