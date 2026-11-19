import type { RequestHandler } from 'express';
import type { Db } from '../../db/prisma.js';
import type { Config } from '../../config/env.js';
import { AppError, forbidden, unauthorized } from '../../http/errors.js';
import type { Role } from '../../generated/prisma/enums.js';
import { ACCESS_COOKIE } from './cookies.js';
import { verifyAccess } from './tokens.js';

/**
 * Authenticates from the httpOnly access cookie, then loads the user by primary key.
 * Role and `active` come from the database, not the token, so changes apply immediately.
 */
export function requireAuth(
  db: Db,
  config: Config,
  opts: { allowPasswordChange?: boolean; allowMfaEnrollment?: boolean } = {},
): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    const claims = typeof token === 'string' ? verifyAccess(config.JWT_ACCESS_SECRET, token) : null;
    if (!claims) throw unauthorized();

    // One round trip: the user, and whether the session this token belongs to is still alive. Logging out,
    // a replayed refresh token, a password reset or a deletion revoke the session, which ends the access
    // token at once instead of when it expires.
    const user = await db.appUser.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        mustChangePassword: true,
        mfaEnabledAt: true,
        refreshTokens: {
          where: { familyId: claims.sid, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user || !user.active || user.refreshTokens.length === 0) throw unauthorized();

    // A password an admin set is temporary: until it is replaced only the endpoints that let the person
    // do exactly that (who am I, change password, sign out) are open.
    if (user.mustChangePassword && !opts.allowPasswordChange) {
      throw new AppError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Choose a new password before continuing',
      );
    }
    const mfaEnrollmentRequired =
      config.MFA_REQUIRED_FOR_ADMINS && user.role === 'ADMIN' && !user.mfaEnabledAt;
    if (mfaEnrollmentRequired && !opts.allowMfaEnrollment) {
      throw new AppError(
        403,
        'MFA_ENROLLMENT_REQUIRED',
        'Set up two-factor sign-in before continuing',
      );
    }
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      mfaEnabled: Boolean(user.mfaEnabledAt),
      mfaEnrollmentRequired,
    };
    req.sessionId = claims.sid;
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
