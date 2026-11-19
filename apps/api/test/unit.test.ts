/** Unit tests: pure logic, no database, no HTTP. */
import jwt from 'jsonwebtoken';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';
import { originCheck } from '../src/http/csrf.js';
import { AppError, errorHandler } from '../src/http/errors.js';
import { rejectNul } from '../src/http/nul.js';
import { hasLetterOrDigit, keyOf, slugOf } from '../src/modules/admin/technologies.js';
import { equaliseTiming, hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import {
  hashToken,
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
} from '../src/modules/auth/tokens.js';
import { passwordProblem } from '../src/modules/auth/passwordPolicy.js';
import { resolveTagIds } from '../src/modules/tags/tags.js';

const SECRET = 's'.repeat(32);
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const SID = '44444444-4444-4444-8444-444444444444';

describe('tokens', () => {
  it('round-trips an access token and refuses other secrets, issuers and algorithms', () => {
    const t = signAccess(SECRET, U1, SID);
    expect(verifyAccess(SECRET, t)).toEqual({ userId: U1, sid: SID });
    expect(verifyAccess('x'.repeat(32), t)).toBeNull();
    expect(verifyAccess(SECRET, jwt.sign({}, SECRET, { subject: U1, issuer: 'other' }))).toBeNull();
    expect(
      verifyAccess(
        SECRET,
        jwt.sign({}, SECRET, { subject: U1, issuer: 'interview-qb', algorithm: 'HS384' }),
      ),
    ).toBeNull();
  });

  it('refuses expired, malformed and empty tokens without throwing', () => {
    expect(verifyAccess(SECRET, signAccess(SECRET, U1, SID, -10))).toBeNull();
    for (const bad of ['', 'abc', 'a.b.c', 'null', '{}'])
      expect(verifyAccess(SECRET, bad)).toBeNull();
  });

  it('requires a UUID subject (it goes into a uuid column)', () => {
    for (const sub of ['abc', '1', "x' OR 1=1", U1.slice(1)]) {
      expect(verifyAccess(SECRET, signAccess(SECRET, sub, SID))).toBeNull();
    }
  });

  it('a refresh token needs subject, jti and family, all UUIDs', () => {
    const ok = signRefresh(SECRET, { userId: U1, jti: U2, familyId: U3 });
    expect(verifyRefresh(SECRET, ok)).toEqual({ userId: U1, jti: U2, familyId: U3 });
    expect(
      verifyRefresh(SECRET, signRefresh(SECRET, { userId: U1, jti: 'nope', familyId: U3 })),
    ).toBeNull();
    expect(
      verifyRefresh(
        SECRET,
        jwt.sign({}, SECRET, { subject: U1, issuer: 'interview-qb', jwtid: U2 }),
      ),
    ).toBeNull(); // no family
    expect(verifyRefresh(SECRET, signAccess(SECRET, U1, SID))).toBeNull(); // an access token is not a refresh token
  });

  it('hashToken is deterministic, hex, and different per token', () => {
    expect(hashToken('a')).toBe(hashToken('a'));
    expect(hashToken('a')).not.toBe(hashToken('b'));
    expect(hashToken('a')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('passwords', () => {
  it('verifies the right password, rejects the wrong one and garbage hashes without throwing', async () => {
    const h = await hashPassword('correct horse');
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, 'correct horse')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    await expect(equaliseTiming('whatever')).resolves.toBeUndefined();
  });
});

describe('originCheck', () => {
  const run = (method: string, origin: string | undefined, allowed = ['http://app.test']) => {
    const next = vi.fn();
    const req = {
      method,
      protocol: 'http',
      get: (h: string) => (h === 'origin' ? origin : h === 'host' ? 'api.test' : undefined),
    };
    let error: unknown;
    try {
      originCheck(allowed)(req as never, {} as never, next);
    } catch (e) {
      error = e;
    }
    return { next, error };
  };

  it('lets safe methods, missing Origin, allow-listed and same-origin through', () => {
    expect(run('GET', 'https://evil.example').next).toHaveBeenCalled();
    expect(run('POST', undefined).next).toHaveBeenCalled();
    expect(run('POST', 'http://app.test').next).toHaveBeenCalled();
    expect(run('POST', 'http://api.test').next).toHaveBeenCalled();
  });

  it.each([
    'https://evil.example',
    'null',
    'http://app.test.evil.example',
    'HTTP://APP.TEST',
    'http://app.test:81',
  ])('blocks an unsafe request from %s', (origin) => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { error, next } = run(method, origin);
      expect(next).not.toHaveBeenCalled();
      expect((error as AppError).status).toBe(403);
    }
  });
});

describe('rejectNul', () => {
  const check = (body: unknown, query: unknown = {}) => {
    const next = vi.fn();
    try {
      rejectNul({ body, query } as never, {} as never, next);
      return 'ok';
    } catch (e) {
      return (e as AppError).status;
    }
  };
  it('finds a NUL byte anywhere: strings, arrays, nested objects, keys and the query', () => {
    expect(check({ a: 'x\u0000' })).toBe(400);
    expect(check({ a: ['ok', { b: 'y\u0000z' }] })).toBe(400);
    expect(check({ ['k\u0000']: 1 })).toBe(400);
    expect(check({}, { q: 'a\u0000b' })).toBe(400);
  });
  it('lets everything else through, including other control characters and unicode', () => {
    expect(check({ a: 'tab\tnewline\n emoji 😀 ‮' })).toBe('ok');
    expect(check(undefined)).toBe('ok');
    expect(check(null)).toBe('ok');
    expect(check({ a: 1, b: [true, null] })).toBe('ok');
  });
});

describe('technology names', () => {
  it('keyOf ignores case, spaces, dots, dashes and underscores, and nothing else', () => {
    for (const v of ['Node.js', 'node-js', 'NODEJS', ' node js ', 'node_js'])
      expect(keyOf(v)).toBe('nodejs');
    expect(keyOf('Ünïcode')).toBe('ünïcode');
    expect(keyOf('日本語')).toBe('日本語');
  });

  it('keyOf keeps the symbols that make names different: C, C++ and C# are three technologies', () => {
    const keys = ['C', 'C++', 'C#', 'F#', '.NET', 'Net'].map(keyOf);
    expect(keys).toEqual(['c', 'c++', 'c#', 'f#', 'net', 'net']);
    expect(new Set(keys.slice(0, 4)).size).toBe(4);
  });

  it('keyOf treats composed and decomposed accents as the same name', () => {
    expect(keyOf('Caf\u00e9')).toBe(keyOf('Cafe\u0301'));
  });

  it('hasLetterOrDigit rejects names made only of punctuation or symbols', () => {
    for (const v of ['+++', '###', ' - ', '.', '😀']) expect(hasLetterOrDigit(v)).toBe(false);
    for (const v of ['C++', 'Go', '日本語', 'Ü', '3D']) expect(hasLetterOrDigit(v)).toBe(true);
  });

  it('slugOf makes URL- and tag-safe ASCII values', () => {
    expect(slugOf('Apache Spark')).toBe('apache-spark');
    expect(slugOf(' Node.js ')).toBe('node-js');
    expect(slugOf('--A--B--')).toBe('a-b');
    expect(slugOf('Go!')).toBe('go');
    expect(slugOf("'; DROP TABLE tag; --")).toBe('drop-table-tag');
  });

  it('slugOf spells out symbols and drops accents, so distinct names get distinct values', () => {
    expect(slugOf('C++')).toBe('c-plus-plus');
    expect(slugOf('C#')).toBe('c-sharp');
    expect(slugOf('F#')).toBe('f-sharp');
    expect(slugOf('Café')).toBe('cafe');
    expect(new Set(['C', 'C++', 'C#'].map(slugOf)).size).toBe(3);
  });

  it('slugOf always yields a valid, stable value, even for names with no Latin letters', () => {
    for (const v of ['日本語', '😀', 'Привет']) {
      expect(slugOf(v)).toMatch(/^tech-[0-9a-f]{8}$/);
      expect(slugOf(v)).toBe(slugOf(v)); // deterministic
    }
    expect(slugOf('日本語')).not.toBe(slugOf('Привет'));
    // every result is accepted by the tag grammar the API enforces
    for (const v of ['C++', 'Café', '日本語', 'Node.js', 'a b c']) {
      expect(`technology:${slugOf(v)}`).toMatch(/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9.-]*$/);
    }
  });
});

describe('error handler', () => {
  const silent = pino({ level: 'silent' });
  const send = (err: unknown) => {
    const out: { status?: number; body?: { error: Record<string, unknown> } } = {};
    const res = {
      headersSent: false,
      status(s: number) {
        out.status = s;
        return this;
      },
      json(b: never) {
        out.body = b;
      },
    };
    errorHandler(silent)(err as never, { log: silent } as never, res as never, vi.fn());
    return out;
  };

  it('shows AppError details, Zod issues and body-parser errors in a stable shape', () => {
    expect(send(new AppError(409, 'X', 'conflict', { extra: 1 }))).toEqual({
      status: 409,
      body: { error: { code: 'X', message: 'conflict', extra: 1 } },
    });
    const zerr = (() => {
      try {
        z.object({ a: z.string() }).parse({});
      } catch (e) {
        return e as ZodError;
      }
    })();
    expect(send(zerr).status).toBe(400);
    expect(
      send(Object.assign(new Error('x'), { type: 'entity.parse.failed' })).body?.error.code,
    ).toBe('INVALID_JSON');
    expect(send(Object.assign(new Error('x'), { type: 'entity.too.large' })).status).toBe(413);
  });

  it('turns anything else into a generic 500 that leaks nothing', () => {
    const out = send(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toMatch(/ECONN|10\.0\.0\.5|hunter2/);
  });
});

describe('resolveTagIds rules (with a stand-in database)', () => {
  const tag = (id: string, value: string, slug: string, archivedAt: Date | null = null) => ({
    id,
    value,
    archivedAt,
    category: { slug },
  });
  const fake = (tags: ReturnType<typeof tag>[], linked: string[]) =>
    ({
      tagCategory: {
        findMany: async ({ where }: { where: { slug: { in: string[] } } }) =>
          [...new Set(tags.map((t) => t.category.slug))]
            .filter((s) => where.slug.in.includes(s))
            .map((slug) => ({
              slug,
              tags: tags
                .filter((t) => t.category.slug === slug)
                .map((t) => ({ id: t.id, value: t.value })),
            })),
      },
      tag: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          tags.filter((t) => where.id.in.includes(t.id)),
      },
      clientTag: {
        findMany: async ({ where }: { where: { tagId: { in: string[] } } }) =>
          linked.filter((id) => where.tagId.in.includes(id)).map((tagId) => ({ tagId })),
      },
    }) as never;

  const tags = [
    tag('t1', 'react', 'technology'),
    tag('t2', 'django', 'technology'),
    tag('t3', 'old', 'technology', new Date()),
    tag('s1', 'mid', 'seniority'),
  ];

  it('global question: any active technology', async () => {
    expect(await resolveTagIds(fake(tags, []), ['technology:react', 'seniority:mid'])).toEqual([
      't1',
      's1',
    ]);
  });
  it('department question: only linked technologies; other categories unaffected', async () => {
    expect(
      await resolveTagIds(fake(tags, ['t1']), ['technology:react', 'seniority:mid'], [], 'c1'),
    ).toEqual(['t1', 's1']);
    await expect(
      resolveTagIds(fake(tags, ['t1']), ['technology:django'], [], 'c1'),
    ).rejects.toMatchObject({ code: 'TAG_NOT_IN_DEPARTMENT' });
  });
  it('archived tags are refused unless the question already carries them', async () => {
    await expect(
      resolveTagIds(fake(tags, ['t3']), ['technology:old'], [], 'c1'),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });
    expect(
      await resolveTagIds(fake(tags, []), ['technology:old'], ['technology:old'], 'c1'),
    ).toEqual(['t3']);
  });
  it('a tag the question already has is kept even if the department dropped it', async () => {
    expect(
      await resolveTagIds(fake(tags, []), ['technology:django'], ['technology:django'], 'c1'),
    ).toEqual(['t2']);
  });
  it('unknown categories and values are a 400 naming nothing sensitive; duplicates collapse', async () => {
    await expect(resolveTagIds(fake(tags, []), ['bogus:x'])).rejects.toMatchObject({
      code: 'UNKNOWN_TAG_CATEGORY',
    });
    await expect(resolveTagIds(fake(tags, []), ['technology:nope'])).rejects.toMatchObject({
      code: 'UNKNOWN_TAG',
    });
    expect(await resolveTagIds(fake(tags, []), ['technology:react', 'technology:react'])).toEqual([
      't1',
    ]);
    expect(await resolveTagIds(fake(tags, []), [])).toEqual([]);
  });
});

describe('password policy', () => {
  const ctx = { email: 'alice.author@example.com', name: 'Alice Author' };

  it('accepts a long, unpredictable password', () => {
    for (const p of [
      'correct-horse-battery-staple',
      'tr0ub4dor&3-and-more',
      'plum 7 river 2 quiet 9',
    ]) {
      expect(passwordProblem(p, ctx)).toBeNull();
    }
  });

  it('refuses short passwords', () => {
    expect(passwordProblem('Short1!', ctx)).toMatch(/12 characters/);
    expect(passwordProblem('a'.repeat(11), ctx)).toMatch(/12 characters/);
  });

  it('refuses well-known passwords however they are dressed up', () => {
    for (const p of [
      'password1234',
      'Password123456',
      'qwertyuiop12',
      'iloveyou1234',
      'Passw0rd!demo',
      'welcome123456',
      'LETMEINLETMEIN',
    ]) {
      expect(passwordProblem(p, ctx), p).toMatch(/common|guess/i);
    }
  });

  it('refuses passwords built from the account email or name', () => {
    expect(passwordProblem('alice.author-2026!', ctx)).toMatch(/email|name/i);
    expect(passwordProblem('ILoveAlice-Author', ctx)).toMatch(/email|name/i);
    expect(passwordProblem('my-name-is-author-1', ctx)).toMatch(/email|name/i);
    // short parts of a name are ignored: "Al" would otherwise block half the dictionary
    expect(passwordProblem('al-bo-1234-xyz-pqr', { email: 'al@x.dev', name: 'Al Bo' })).toBeNull();
  });

  it('refuses repeats and runs', () => {
    for (const p of [
      'aaaaaaaaaaaa',
      '121212121212',
      '123456789012',
      'abcdefghijkl',
      'abababababab',
    ]) {
      expect(passwordProblem(p, ctx), p).not.toBeNull();
    }
  });

  it('works without a name or email', () => {
    expect(passwordProblem('correct-horse-battery-staple', {})).toBeNull();
  });
});
