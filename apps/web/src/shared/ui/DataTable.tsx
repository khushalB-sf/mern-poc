import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, buttonClass } from './Button';
import { cx } from './cx';
import { Icon } from './Icon';

// The pieces every admin list page is built from, so Users, Departments and Tags look and behave alike:
//   PageHeader (title + AddButton)  ->  Toolbar (SearchField + FilterSelects + count)  ->  DataTable.

/** The one "Add" button: primary, with a plus, in the page header. */
export function AddButton({
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant="primary" {...rest}>
      <Icon name="plus" />
      {children}
    </Button>
  );
}

/** The same button for a page that adds on another screen. */
export function AddLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClass('primary')}>
      <Icon name="plus" />
      {children}
    </Link>
  );
}

/** Search, filters and a live count in one row. `summary` is announced politely as it changes. */
export function Toolbar({ children, summary }: { children: ReactNode; summary?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {children}
      {summary && (
        <p aria-live="polite" className="ml-auto self-center text-sm text-ink-soft">
          {summary}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'min-h-10 rounded-lg border border-control bg-surface text-ink shadow-sm transition-colors hover:border-ink-soft ' +
  'focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0';

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 100,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div role="search" className="relative w-full sm:w-72">
      <label htmlFor={`search-${label}`} className="sr-only">
        {label}
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
      />
      <input
        id={`search-${label}`}
        type="search"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cx(CONTROL, 'w-full pl-9 pr-3 placeholder:text-ink-soft')}
      />
    </div>
  );
}

/** A native select with its label above it, so what it filters is always visible. */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  // A real for/id pair (not a wrapping label), so the accessible name is just the label text.
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(CONTROL, 'min-w-36 px-2 text-sm font-normal')}
      >
        {children}
      </select>
    </div>
  );
}

export function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="self-end">
      Clear filters
    </Button>
  );
}

type Column = string | { label: string; srOnly?: boolean; className?: string };

/** The one table: rounded card, quiet header, scrolls sideways on a phone instead of squashing. */
export function DataTable({
  caption,
  columns,
  children,
}: {
  caption: string;
  columns: Column[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wider text-ink-soft">
            {columns.map((c) => {
              const col = typeof c === 'string' ? { label: c } : c;
              return (
                <th
                  key={col.label}
                  scope="col"
                  className={cx(
                    'px-4 py-3 font-semibold',
                    (col as { className?: string }).className,
                  )}
                >
                  {(col as { srOnly?: boolean }).srOnly ? (
                    <span className="sr-only">{col.label}</span>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const ROW = 'border-b border-line align-middle last:border-b-0 hover:bg-surface-2/60';
export const CELL = 'px-4 py-3';

/** The last cell of a row: the same buttons, in the same place, on every page. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-1">{children}</div>;
}

const TONE = {
  ok: 'bg-ok-bg text-ok',
  muted: 'bg-surface-2 text-ink-soft border border-line',
  danger: 'bg-danger-bg text-danger',
} as const;

export function StatusBadge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', TONE[tone])}>
      {children}
    </span>
  );
}
