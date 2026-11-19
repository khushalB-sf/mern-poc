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
      status: '',
      mine: false,
      page: 3,
    });
  });

  it('carries a valid review status and drops an unknown one', () => {
    expect(parseFilters(new URLSearchParams('status=PENDING')).status).toBe('PENDING');
    expect(parseFilters(new URLSearchParams('status=BOGUS')).status).toBe('');
    expect(toSearchParams({ ...EMPTY_FILTERS, status: 'REJECTED' }).get('status')).toBe('REJECTED');
    expect(
      new URLSearchParams(toApiQuery({ ...EMPTY_FILTERS, status: 'PENDING' })).get('status'),
    ).toBe('PENDING');
    expect(new URLSearchParams(toApiQuery(EMPTY_FILTERS)).has('status')).toBe(false);
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
    const f = {
      q: 'a b',
      tags: ['type:coding', 'technology:go'],
      clientId: 'c1',
      status: 'APPROVED' as const,
      mine: true,
      page: 2,
    };
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
      activeFilterCount({
        ...EMPTY_FILTERS,
        q: 'x',
        tags: ['a:b', 'c:d'],
        clientId: 'c1',
        status: 'PENDING',
      }),
    ).toBe(4);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, q: 'x' })).toBe(true);
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
  });
});

describe('the "my questions" filter', () => {
  it('lives in the URL as mine=true and round-trips', () => {
    const f = parseFilters(new URLSearchParams('mine=true&q=cache'));
    expect(f.mine).toBe(true);
    expect(toSearchParams(f).toString()).toBe('q=cache&mine=true');
    expect(parseFilters(new URLSearchParams('')).mine).toBe(false);
    expect(parseFilters(new URLSearchParams('mine=yes')).mine).toBe(false); // only "true" counts
    expect(toSearchParams({ ...EMPTY_FILTERS }).toString()).toBe(''); // off by default: clean URL
  });

  it('is sent to the API only when on', () => {
    expect(toApiQuery({ ...EMPTY_FILTERS, mine: true })).toContain('mine=true');
    expect(toApiQuery(EMPTY_FILTERS)).not.toContain('mine');
  });
});
