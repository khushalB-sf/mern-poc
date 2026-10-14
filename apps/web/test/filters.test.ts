import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  hasAnyFilter,
  parseFilters,
  toApiQuery,
  toSearchParams,
  toggleTag,
} from '../src/features/questions/filters';

describe('filters <-> URL', () => {
  it('parses a full URL', () => {
    const f = parseFilters(
      new URLSearchParams('q=hooks&tags=technology:react,seniority:senior&client=c1&page=3'),
    );
    expect(f).toEqual({
      q: 'hooks',
      tags: ['seniority:senior', 'technology:react'],
      clientId: 'c1',
      page: 3,
    });
  });

  it('uses safe defaults for an empty or hostile URL', () => {
    expect(parseFilters(new URLSearchParams(''))).toEqual(EMPTY_FILTERS);
    for (const page of ['0', '-4', 'abc', '']) {
      expect(parseFilters(new URLSearchParams({ page })).page).toBe(1);
    }
    expect(parseFilters(new URLSearchParams('tags=,,')).tags).toEqual([]);
  });

  it('round-trips, and omits defaults so the clean view has a clean URL', () => {
    expect(toSearchParams(EMPTY_FILTERS).toString()).toBe('');
    const f = { q: 'a b', tags: ['type:coding', 'technology:go'], clientId: 'c1', page: 2 };
    expect(parseFilters(toSearchParams(f))).toEqual({
      ...f,
      tags: ['technology:go', 'type:coding'],
    });
  });

  it('builds the API query with limit and offset from the page', () => {
    const sp = new URLSearchParams(
      toApiQuery({ ...EMPTY_FILTERS, q: '  closure ', tags: ['technology:react'], page: 3 }),
    );
    expect(sp.get('limit')).toBe(String(PAGE_SIZE));
    expect(sp.get('offset')).toBe(String(2 * PAGE_SIZE));
    expect(sp.get('q')).toBe('closure'); // trimmed
    expect(sp.get('tags')).toBe('technology:react');
    expect(new URLSearchParams(toApiQuery(EMPTY_FILTERS)).has('q')).toBe(false);
  });

  it('toggling a tag adds/removes it and returns to page 1', () => {
    const on = toggleTag({ ...EMPTY_FILTERS, page: 4 }, 'technology:react');
    expect(on).toMatchObject({ tags: ['technology:react'], page: 1 });
    expect(toggleTag(on, 'technology:react').tags).toEqual([]);
  });

  it('counts active filters (the keyword is not a filter)', () => {
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, q: 'x', tags: ['a:b', 'c:d'], clientId: 'c1' }),
    ).toBe(3);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, q: 'x' })).toBe(true);
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
  });
});
