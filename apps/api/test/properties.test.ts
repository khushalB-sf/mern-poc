/** Property tests: the pure helpers hold for thousands of generated inputs, not just the ones someone thought of. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { csvCell } from '../src/http/csv.js';
import { freeValue, keyOf, slugOf } from '../src/modules/admin/technologies.js';
import { encodeCursor, stringIdCursor } from '../src/http/cursor.js';
import { signAccess, verifyAccess } from '../src/modules/auth/tokens.js';

const text = fc.string({ unit: 'binary', maxLength: 60 });

describe('csvCell', () => {
  const unquote = (cell: string) => cell.slice(1, -1).replace(/""/g, '"');

  it('is always one quoted cell whose quotes are all doubled', () => {
    fc.assert(
      fc.property(text, (s) => {
        const cell = csvCell(s);
        expect(cell.startsWith('"') && cell.endsWith('"')).toBe(true);
        expect(cell.slice(1, -1).replace(/""/g, '')).not.toContain('"');
      }),
    );
  });

  it('never lets a spreadsheet read user text as a formula', () => {
    fc.assert(
      fc.property(text, (s) => {
        expect(unquote(csvCell(s))).not.toMatch(/^[=+\-@\t\r]/);
      }),
    );
  });

  it('keeps the text itself, apart from the one guarding apostrophe', () => {
    fc.assert(
      fc.property(text, (s) => {
        const back = unquote(csvCell(s));
        expect(back === s || back === `'${s}`).toBe(true);
      }),
    );
  });
});

describe('keyOf (duplicate technology names)', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(text, (s) => {
        expect(keyOf(keyOf(s))).toBe(keyOf(s));
      }),
    );
  });

  it('ignores case and the separators space . - _ (so "Next.js" and "next js" are the same name)', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]{1,12}$/),
        fc.constantFrom(' ', '.', '-', '_'),
        (word, sep) => {
          const split = [...word].join(sep);
          expect(keyOf(split.toUpperCase())).toBe(keyOf(word));
        },
      ),
    );
  });
});

describe('slugOf (stored technology value)', () => {
  it('is always a non-empty lowercase ascii slug safe for the tag grammar', () => {
    fc.assert(
      fc.property(text, (s) => {
        expect(slugOf(s)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(text, (s) => {
        expect(slugOf(s)).toBe(slugOf(s));
      }),
    );
  });
});

describe('freeValue', () => {
  it('returns a value that is not taken, and the base itself when it is free', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 6 }), { maxLength: 20 }),
        fc.string({ maxLength: 6 }),
        (taken, base) => {
          const set = new Set(taken);
          const v = freeValue(base, set);
          expect(set.has(v)).toBe(false);
          if (!set.has(base)) expect(v).toBe(base);
        },
      ),
    );
  });
});

describe('paging cursors', () => {
  const parse = (raw: string) => stringIdCursor.safeParse(raw);

  it('a [name, uuid] cursor survives the round trip exactly', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), fc.uuid(), (name, id) => {
        const r = parse(encodeCursor([name, id]));
        expect(r.success && r.data).toEqual([name, id]);
      }),
    );
  });

  it('anything that is not exactly [string, uuid] is refused', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        fc.pre(
          !(
            Array.isArray(v) &&
            v.length === 2 &&
            typeof v[0] === 'string' &&
            typeof v[1] === 'string' &&
            /^[0-9a-f-]{36}$/i.test(v[1])
          ),
        );
        expect(parse(encodeCursor([v])).success).toBe(false);
        expect(parse(Buffer.from(JSON.stringify(v)).toString('base64url')).success).toBe(false);
      }),
    );
  });

  it('random text is never accepted and never throws', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (raw) => {
        expect(parse(raw).success).toBe(false);
      }),
    );
  });
});

describe('access tokens', () => {
  const secret = 'x'.repeat(40);

  it('carry exactly the user and session they were issued for', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (userId, sid) => {
        expect(verifyAccess(secret, signAccess(secret, userId, sid))).toMatchObject({
          userId,
          sid,
        });
      }),
    );
  });

  it('are refused under another secret and when any character is changed', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), fc.nat(), (userId, sid, at) => {
        const token = signAccess(secret, userId, sid);
        expect(verifyAccess('y'.repeat(40), token)).toBeNull();
        const i = at % token.length;
        const tampered = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
        expect(verifyAccess(secret, tampered)).toBeNull();
      }),
    );
  });
});
