import type { RequestHandler } from 'express';
import type { Db } from '../../db/prisma.js';
import type { Config } from '../../config/env.js';
import { forbidden, unauthorized } from '../../http/errors.js';
import type { Role } from '../../generated/prisma/enums.js';
import { ACCESS_COOKIE } from './cookies.js';
import { verifyAccess } from './tokens.js';

/**
 * Authenticates from the httpOnly access cookie, then loads the user by primary key.
 * Role and `active` come from the database, not the token, so changes apply immediately.
 */
export function requireAuth(db: Db, config: Config): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    const claims = typeof token === 'string' ? verifyAccess(config.JWT_ACCESS_SECRET, token) : null;
    if (!claims) throw unauthorized();

    // One round trip: the user, and whether the session this token belongs to is still alive. Logging out,
    // a replayed refresh token, a deactivation or a deletion revoke the session, which ends the access
    // token at once instead of when it expires.
    const user = await db.appUser.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        refreshTokens: {
          where: { familyId: claims.sid, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user || !user.active || user.refreshTokens.length === 0) throw unauthorized();

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    next();
  };
}

/** Role gate; run after requireAuth. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
