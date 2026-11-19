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
  /** Authors and admins write questions; read-only users and reviewers have no "mine" to filter. */
  showMine?: boolean;
  filters: Filters;
  onChange: (next: Filters) => void;
}

/** Technology values of the chosen department, or null when none is chosen (or the list has none). */
function technologiesOf(clients: Client[] | undefined, clientId: string) {
  const list = clientId ? clients?.find((c) => c.id === clientId)?.technologies : undefined;
  return list ? new Set(list) : null;
}

/** One dropdown per tag category, plus review status and department, in a row above the results. */
export function FilterBar({
  categories,
  clients,
  tagsError,
  onRetryTags,
  showStatus,
  showMine = false,
  filters,
  onChange,
}: Props) {
  const departmentTechs = technologiesOf(clients, filters.clientId);
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
        categories.map((c) => {
          // With a department chosen, Technology shows that department's technologies only.
          const tags = c.tags.filter(
            (t) => c.slug !== 'technology' || !departmentTechs || departmentTechs.has(t.value),
          );
          if (tags.length === 0) return null;
          const main = tags.filter((t) => !t.other);
          const other = tags.filter((t) => t.other);
          const option = (t: (typeof tags)[number]) => {
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
          };
          return (
            <Dropdown
              key={c.slug}
              label={c.name}
              count={filters.tags.filter((t) => t.startsWith(`${c.slug}:`)).length}
            >
              <fieldset>
                <legend className="sr-only">{c.name}</legend>
                {main.map(option)}
                {other.length > 0 && (
                  <fieldset className={main.length > 0 ? 'mt-1 border-t border-line pt-1' : ''}>
                    <legend className="px-2 pt-1 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                      Other
                    </legend>
                    {other.map(option)}
                  </fieldset>
                )}
              </fieldset>
            </Dropdown>
          );
        })
      )}

      {showMine && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm has-[:checked]:border-accent/40 has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
          <input
            type="checkbox"
            checked={filters.mine}
            onChange={() => onChange({ ...filters, mine: !filters.mine, page: 1 })}
            className={INPUT}
          />
          My questions
        </label>
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
                  onChange={() => {
                    // Technologies the department doesn't have would be a hidden filter: drop them.
                    const allowed = technologiesOf(clients, c.id);
                    onChange({
                      ...filters,
                      clientId: c.id,
                      tags: allowed
                        ? filters.tags.filter(
                            (t) =>
                              !t.startsWith('technology:') ||
                              allowed.has(t.slice('technology:'.length)),
                          )
                        : filters.tags,
                      page: 1,
                    });
                  }}
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
