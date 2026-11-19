/** The question list lives in the URL: whatever filters are chosen must come back unchanged from it. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_OFFSET,
  PAGE_SIZE,
  STATUSES,
  parseFilters,
  toApiQuery,
  toSearchParams,
  type Filters,
} from '../src/features/questions/filters';

const tag = fc.stringMatching(/^[a-z]{1,8}:[a-z0-9-]{1,10}$/);
const filters: fc.Arbitrary<Filters> = fc.record({
  q: fc.string({ maxLength: 40 }),
  tags: fc.uniqueArray(tag, { maxLength: 6 }).map((t) => [...t].sort()),
  clientId: fc.oneof(fc.constant(''), fc.uuid()),
  status: fc.constantFrom('', ...STATUSES),
  mine: fc.boolean(),
  page: fc.integer({ min: 1, max: 500 }),
});

describe('filters <-> URL', () => {
  it('parse(toSearchParams(f)) gives f back, however odd the search text', () => {
    fc.assert(
      fc.property(filters, (f) => {
        const url = toSearchParams(f).toString();
        expect(parseFilters(new URLSearchParams(url))).toEqual(f);
      }),
    );
  });

  it('parsing never throws and always yields a usable state, whatever the URL holds', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (raw) => {
        const f = parseFilters(new URLSearchParams(raw));
        expect(Number.isInteger(f.page) && f.page >= 1).toBe(true);
        expect(['', ...STATUSES]).toContain(f.status);
        expect(f.tags).toEqual([...f.tags].sort());
      }),
    );
  });

  it('the API query pages by the page size and carries only what is set', () => {
    fc.assert(
      fc.property(filters, (f) => {
        const q = new URLSearchParams(toApiQuery(f));
        expect(q.get('limit')).toBe(String(PAGE_SIZE));
        expect(q.get('offset')).toBe(String((f.page - 1) * PAGE_SIZE));
        expect(Number(q.get('offset'))).toBeLessThanOrEqual(MAX_OFFSET);
        expect(q.has('clientId')).toBe(f.clientId !== '');
        expect(q.has('status')).toBe(f.status !== '');
        expect(q.get('q')).toBe(f.q.trim() === '' ? null : f.q.trim());
      }),
    );
  });
});
