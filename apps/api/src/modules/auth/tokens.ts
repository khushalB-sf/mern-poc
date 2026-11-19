import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const ISSUER = 'interview-qb';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALG = 'HS256' as const; // pinned on both sign and verify; "none"/RS* tokens are rejected

/** `sid` is the refresh-token family (the session): the access token is only good while that session lives. */
export const signAccess = (secret: string, userId: string, sid: string, ttl = ACCESS_TTL_SECONDS) =>
  jwt.sign({ sid }, secret, { algorithm: ALG, subject: userId, issuer: ISSUER, expiresIn: ttl });

export interface RefreshClaims {
  userId: string;
  jti: string;
  familyId: string;
}

export const signRefresh = (secret: string, c: RefreshClaims, ttl = REFRESH_TTL_SECONDS) =>
  jwt.sign({ fam: c.familyId }, secret, {
    algorithm: ALG,
    subject: c.userId,
    issuer: ISSUER,
    jwtid: c.jti,
    expiresIn: ttl,
  });

function verify(secret: string, token: string): jwt.JwtPayload | null {
  try {
    const p = jwt.verify(token, secret, { algorithms: [ALG], issuer: ISSUER });
    return typeof p === 'object' ? p : null;
  } catch {
    return null; // bad signature, expired, malformed: all the same to the caller
  }
}

export const verifyAccess = (
  secret: string,
  token: string,
): { userId: string; sid: string } | null => {
  const p = verify(secret, token);
  // Ids go straight into a uuid column: anything else would be a database error, not a 401.
  const ok =
    p &&
    typeof p.sub === 'string' &&
    UUID.test(p.sub) &&
    typeof p.sid === 'string' &&
    UUID.test(p.sid);
  return ok ? { userId: p.sub!, sid: p.sid as string } : null;
};

export const verifyRefresh = (secret: string, token: string): RefreshClaims | null => {
  const p = verify(secret, token);
  const ids = [p?.sub, p?.jti, p?.fam];
  if (!p || !ids.every((v) => typeof v === 'string' && UUID.test(v))) return null;
  return { userId: p.sub!, jti: p.jti!, familyId: p.fam as string };
};

/** Refresh tokens are stored hashed, so a database leak does not yield usable tokens. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
