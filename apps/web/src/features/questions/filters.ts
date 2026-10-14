/** Filter state lives in the URL, so a filtered view can be shared, bookmarked and reached with Back. */
export const PAGE_SIZE = 20;

export interface Filters {
  q: string;
  /** "category:value" entries, same format the API takes. */
  tags: string[];
  clientId: string;
  /** 1-based. */
  page: number;
}

export const EMPTY_FILTERS: Filters = { q: '', tags: [], clientId: '', page: 1 };

export function parseFilters(sp: URLSearchParams): Filters {
  const page = Number.parseInt(sp.get('page') ?? '1', 10);
  return {
    q: sp.get('q') ?? '',
    tags: (sp.get('tags') ?? '').split(',').filter(Boolean).sort(),
    clientId: sp.get('client') ?? '',
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/** Defaults are omitted so the clean list view has a clean URL. */
export function toSearchParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.tags.length) sp.set('tags', [...f.tags].sort().join(','));
  if (f.clientId) sp.set('client', f.clientId);
  if (f.page > 1) sp.set('page', String(f.page));
  return sp;
}

export function toApiQuery(f: Filters): string {
  const sp = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((f.page - 1) * PAGE_SIZE),
  });
  if (f.q.trim()) sp.set('q', f.q.trim());
  if (f.tags.length) sp.set('tags', [...f.tags].sort().join(','));
  if (f.clientId) sp.set('clientId', f.clientId);
  return sp.toString();
}

export const activeFilterCount = (f: Filters) => f.tags.length + (f.clientId ? 1 : 0);
export const hasAnyFilter = (f: Filters) => activeFilterCount(f) > 0 || f.q.trim() !== '';

/** Toggle one "category:value" tag; always returns to page 1 because the result set changed. */
export function toggleTag(f: Filters, tag: string): Filters {
  const tags = f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag];
  return { ...f, tags: tags.sort(), page: 1 };
}
