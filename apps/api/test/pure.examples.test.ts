/** Exact examples for the small pure helpers (the property tests cover the general shape; these pin the details). */
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { csvCell } from '../src/http/csv.js';
import { encodeCursor, stringIdCursor } from '../src/http/cursor.js';
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
} from '../src/modules/auth/tokens.js';

const ID = '11111111-1111-4111-8111-111111111111';
const secret = 's'.repeat(40);

describe('csvCell', () => {
  it('writes empty for null and undefined, text for everything else', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(false)).toBe('"false"');
    expect(csvCell('plain')).toBe('"plain"');
  });

  it('doubles quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('defuses a formula start: %j', (v) => {
    expect(csvCell(v)).toBe(`"'${v}"`);
  });

  it('leaves operators in the middle alone', () => {
    for (const v of ['a=b', 'x-1', 'a+b', 'me@example.com', ' =x'])
      expect(csvCell(v)).toBe(`"${v}"`);
  });
});

describe('cursor', () => {
  const parse = (v: unknown) =>
    stringIdCursor.safeParse(Buffer.from(JSON.stringify(v)).toString('base64url'));

  it('accepts exactly [string, uuid]', () => {
    expect(parse(['Ann', ID])).toMatchObject({ success: true, data: ['Ann', ID] });
    expect(encodeCursor(['Ann', ID])).toBe(
      Buffer.from(JSON.stringify(['Ann', ID])).toString('base64url'),
    );
  });

  it.each([
    ['too short', ['Ann']],
    ['too long', ['Ann', ID, 'x']],
    ['number first', [1, ID]],
    ['number second', ['Ann', 7]],
    ['object', { a: 1 }],
    ['prefix before the id', ['Ann', `x${ID}`]],
    ['suffix after the id', ['Ann', `${ID}x`]],
  ])('refuses %s', (_name, v) => {
    expect(parse(v).success).toBe(false);
  });

  it('refuses garbage with a clear message', () => {
    const r = stringIdCursor.safeParse('%%%not-base64%%%');
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]).toMatchObject({
      code: 'custom',
      message: 'Invalid cursor',
    });
  });
});

describe('tokens', () => {
  it('use the documented lifetimes', () => {
    expect(ACCESS_TTL_SECONDS).toBe(15 * 60);
    expect(REFRESH_TTL_SECONDS).toBe(7 * 24 * 3600);
    const claims = jwt.decode(signAccess(secret, ID, ID)) as { exp: number; iat: number };
    expect(claims.exp - claims.iat).toBe(ACCESS_TTL_SECONDS);
  });

  it('are refused when signed for a different issuer, or none', () => {
    expect(
      verifyAccess(secret, jwt.sign({ sid: ID }, secret, { subject: ID, issuer: 'other' })),
    ).toBeNull();
    expect(verifyAccess(secret, jwt.sign({ sid: ID }, secret, { subject: ID }))).toBeNull();
  });

  it('are refused when the ids are not plain uuids', () => {
    const forge = (sub: string, sid: string) =>
      jwt.sign({ sid }, secret, { subject: sub, issuer: 'interview-qb' });
    expect(verifyAccess(secret, forge(ID, ID))).toEqual({ userId: ID, sid: ID });
    expect(verifyAccess(secret, forge(`x${ID}`, ID))).toBeNull();
    expect(verifyAccess(secret, forge(ID, `${ID}x`))).toBeNull();
  });

  it('refresh tokens carry user, token id and family, and nothing else is accepted', () => {
    const t = signRefresh(secret, { userId: ID, jti: ID, familyId: ID });
    expect(verifyRefresh(secret, t)).toEqual({ userId: ID, jti: ID, familyId: ID });
    const noFamily = jwt.sign({}, secret, { subject: ID, jwtid: ID, issuer: 'interview-qb' });
    expect(verifyRefresh(secret, noFamily)).toBeNull();
    const badJti = jwt.sign({ fam: ID }, secret, {
      subject: ID,
      jwtid: `${ID}x`,
      issuer: 'interview-qb',
    });
    expect(verifyRefresh(secret, badJti)).toBeNull();
    const badFam = jwt.sign({ fam: `x${ID}` }, secret, {
      subject: ID,
      jwtid: ID,
      issuer: 'interview-qb',
    });
    expect(verifyRefresh(secret, badFam)).toBeNull();
  });
});
