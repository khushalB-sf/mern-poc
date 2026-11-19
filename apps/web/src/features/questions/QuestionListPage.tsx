import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import { STATUS_LABEL, plural } from '../../shared/lib/format';
import { Button, buttonClass } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Page, PageHeader } from '../../shared/ui/Page';
import { cx } from '../../shared/ui/cx';
import { EmptyState, ErrorState, ListSkeleton } from '../../shared/ui/states';
import { canCreate, useMe } from '../auth/hooks';
import { FilterBar } from './components/FilterBar';
import { Pagination } from './components/Pagination';
import { QuestionRow } from './components/QuestionRow';
import { labelLookup } from './components/chips';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
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
  const tags = useTags(); // full taxonomy, so chips from a pasted URL still get labels
  const filterTags = useTags(true); // what the filter bar offers
  const clients = useClients();
  const tagLabel = useMemo(() => labelLookup(tags.data), [tags.data]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const goToPage = (page: number) => {
    setFilters({ ...filters, page });
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  };

  const total = search.data?.page.total ?? 0;
  const items = search.data?.items ?? [];
  const refreshing = search.isFetching && !search.isPending; // showing stale results while loading new ones

  const filterBar = (
    <FilterBar
      categories={filterTags.data}
      clients={clients.data}
      tagsError={filterTags.isError}
      onRetryTags={() => void filterTags.refetch()}
      showStatus={me?.role !== 'USER'}
      showMine={me ? canCreate(me) : false}
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
            label: `${clients.data?.find((c) => c.id === filters.clientId)?.name ?? 'Department'} only`,
            remove: () => setFilters({ ...filters, clientId: '', page: 1 }),
          },
        ]
      : []),
    ...(filters.mine
      ? [
          {
            key: 'mine',
            label: 'My questions',
            remove: () => setFilters({ ...filters, mine: false, page: 1 }),
          },
        ]
      : []),
    ...(filters.status
      ? [
          {
            key: 'status',
            label: STATUS_LABEL[filters.status],
            remove: () => setFilters({ ...filters, status: '', page: 1 }),
          },
        ]
      : []),
  ];

  return (
    <Page>
      <PageHeader
        title="Questions"
        description="Search and filter your team's interview questions."
        headingRef={headingRef}
        actions={
          me &&
          canCreate(me) && (
            <Link to="/questions/new" className={buttonClass('primary')}>
              <Icon name="plus" />
              Add question
            </Link>
          )
        }
      />

      <form role="search" onSubmit={(e) => e.preventDefault()} className="flex gap-2">
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
            className="min-h-12 w-full rounded-xl border border-control bg-surface pl-11 pr-3 text-base shadow-sm transition-colors placeholder:text-ink-soft hover:border-ink-soft focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0"
          />
        </div>
      </form>

      <div className="mt-4">{filterBar}</div>

      <div className="mt-5">
        <section aria-label="Results" aria-busy={search.isFetching} className="min-w-0">
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            <p role="status" className="text-sm font-medium text-ink-soft">
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
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 text-sm font-medium text-accent hover:border-accent"
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

          <div className={cx('mt-3 transition-opacity', refreshing && 'opacity-60')}>
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
              <ul className="space-y-3">
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
    </Page>
  );
}
