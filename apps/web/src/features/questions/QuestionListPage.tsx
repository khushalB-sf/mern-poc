import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { plural } from '../../shared/lib/format';
import { Button, buttonClass } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { Icon } from '../../shared/ui/Icon';
import { cx } from '../../shared/ui/cx';
import { EmptyState, ErrorState, ListSkeleton } from '../../shared/ui/states';
import { canCreate, useMe } from '../auth/hooks';
import { FilterPanel } from './components/FilterPanel';
import { Pagination } from './components/Pagination';
import { QuestionRow } from './components/QuestionRow';
import { labelLookup } from './components/chips';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  hasAnyFilter,
  parseFilters,
  toSearchParams,
  toggleTag,
  type Filters,
} from './filters';
import { useClients, useQuestionSearch, useTags } from './hooks';

export function QuestionListPage() {
  useDocumentTitle('Questions');
  const { data: me } = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  // The URL is the source of truth for filters; `replace` keeps Back from stepping through every keystroke.
  const setFilters = (next: Filters, replace = false) =>
    setSearchParams(toSearchParams(next), { replace });

  // Typing is local and debounced into the URL.
  const [text, setText] = useState(filters.q);
  const debounced = useDebouncedValue(text, 300);
  const lastPushed = useRef(filters.q);
  useEffect(() => {
    if (debounced !== lastPushed.current) {
      lastPushed.current = debounced;
      setFilters({ ...filters, q: debounced, page: 1 }, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);
  useEffect(() => {
    // The URL changed from outside (Clear all, Back): reflect it in the box.
    if (filters.q !== lastPushed.current) {
      lastPushed.current = filters.q;
      setText(filters.q);
    }
  }, [filters.q]);

  const search = useQuestionSearch(filters);
  const tags = useTags();
  const clients = useClients();
  const tagLabel = useMemo(() => labelLookup(tags.data), [tags.data]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const goToPage = (page: number) => {
    setFilters({ ...filters, page });
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  };

  const total = search.data?.page.total ?? 0;
  const items = search.data?.items ?? [];
  const refreshing = search.isFetching && !search.isPending; // showing stale results while loading new ones
  const activeCount = activeFilterCount(filters);

  const panel = (
    <FilterPanel
      categories={tags.data}
      clients={clients.data}
      tagsError={tags.isError}
      onRetryTags={() => void tags.refetch()}
      filters={filters}
      onChange={(f) => setFilters(f)}
    />
  );

  // Selected filters shown as removable chips above the results.
  const chips = [
    ...filters.tags.map((t) => {
      const [category, value] = t.split(':') as [string, string];
      return {
        key: t,
        label: tagLabel(category, value),
        remove: () => setFilters(toggleTag(filters, t)),
      };
    }),
    ...(filters.clientId
      ? [
          {
            key: 'client',
            label: `${clients.data?.find((c) => c.id === filters.clientId)?.name ?? 'Client'} only`,
            remove: () => setFilters({ ...filters, clientId: '', page: 1 }),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold">
          Questions
        </h1>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="q" className="sr-only">
            Search question text and answer notes
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-soft"
          />
          <input
            id="q"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search question text and answer notes"
            autoComplete="off"
            maxLength={200}
            className="min-h-12 w-full rounded-md border border-control bg-surface pl-11 pr-3 text-base placeholder:text-ink-soft"
          />
        </div>
        <Button className="min-h-12 lg:hidden" onClick={() => setFiltersOpen(true)}>
          <Icon name="filter" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-xs text-accent-ink">
              {activeCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </form>

      <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto p-1">{panel}</div>
        </aside>

        <section aria-label="Results" aria-busy={search.isFetching} className="min-w-0">
          {/* pl-5 lines this row up with the question text (4px edge + 16px padding on each row). */}
          <div className="flex min-h-8 flex-wrap items-center gap-2 pl-5">
            <p role="status" className="text-sm text-ink-soft">
              {search.isPending
                ? 'Loading questions'
                : hasAnyFilter(filters)
                  ? `${plural(total, 'question')} ${total === 1 ? 'matches' : 'match'}`
                  : plural(total, 'question')}
            </p>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.remove}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm hover:opacity-80"
              >
                {c.label}
                <Icon name="x" className="size-3.5" />
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            {hasAnyFilter(filters) && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="min-h-8 rounded px-2 text-sm font-medium text-accent underline underline-offset-4"
              >
                Clear all
              </button>
            )}
          </div>

          <div className={cx('mt-2 transition-opacity', refreshing && 'opacity-60')}>
            {search.isPending ? (
              <ListSkeleton />
            ) : search.isError && !search.data ? (
              <ErrorState title="Couldn't load questions" onRetry={() => void search.refetch()}>
                {search.error.message}
              </ErrorState>
            ) : items.length === 0 ? (
              <EmptyState
                title={hasAnyFilter(filters) ? 'No questions match' : 'No questions yet'}
                action={
                  hasAnyFilter(filters) ? (
                    <Button onClick={() => setFilters(EMPTY_FILTERS)}>
                      Clear search and filters
                    </Button>
                  ) : me && canCreate(me) ? (
                    <Link to="/questions/new" className={buttonClass('primary')}>
                      Add the first question
                    </Link>
                  ) : undefined
                }
              >
                {hasAnyFilter(filters)
                  ? 'Try fewer filters, or search for a different word. Keywords match both the question and its answer notes.'
                  : 'Questions your team adds will appear here.'}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((q) => (
                  <QuestionRow key={q.id} question={q} tagLabel={tagLabel} />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} onPage={goToPage} />
          </div>
        </section>
      </div>

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        {panel}
        {/* Sticky so the way out is always visible, however long the filter list is. */}
        <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 border-t border-line bg-surface p-4 sm:-mx-6 sm:-mb-6">
          <Button variant="primary" className="w-full" onClick={() => setFiltersOpen(false)}>
            Show {search.data ? plural(total, 'question') : 'results'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
