import type { RequestHandler } from 'express';
import type { Db } from '../../db/prisma.js';
import type { Config } from '../../config/env.js';
import { unauthorized } from '../../http/errors.js';
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

    const user = await db.appUser.findUnique({
      where: { id: claims.userId },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (!user || !user.active) throw unauthorized();

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  };
}
