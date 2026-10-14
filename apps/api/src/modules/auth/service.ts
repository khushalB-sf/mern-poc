import { randomUUID } from 'node:crypto';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { unauthorized } from '../../http/errors.js';
import { equaliseTiming, verifyPassword } from './password.js';
import {
  REFRESH_TTL_SECONDS,
  hashToken,
  signAccess,
  signRefresh,
  verifyRefresh,
} from './tokens.js';

const publicUser = (u: { id: string; email: string; name: string; role: string }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});

export function createAuthService(db: Db, config: Config) {
  async function issue(userId: string, familyId: string) {
    const jti = randomUUID();
    const refresh = signRefresh(config.JWT_REFRESH_SECRET, { userId, jti, familyId });
    await db.refreshToken.create({
      data: {
        id: jti,
        userId,
        familyId,
        tokenHash: hashToken(refresh),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    });
    return { access: signAccess(config.JWT_ACCESS_SECRET, userId), refresh };
  }

  const revokeFamily = (familyId: string) =>
    db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

  return {
    async login(email: string, password: string) {
      const user = await db.appUser.findUnique({ where: { email } });
      // Same error and same work for unknown email, wrong password and disabled account.
      if (!user) {
        await equaliseTiming(password);
        throw unauthorized('Invalid email or password');
      }
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok || !user.active) throw unauthorized('Invalid email or password');
      return { user: publicUser(user), ...(await issue(user.id, randomUUID())) };
    },

    /** Rotating refresh: each token works once; replaying a used token revokes the whole family. */
    async refresh(token: string | undefined) {
      const claims = token ? verifyRefresh(config.JWT_REFRESH_SECRET, token) : null;
      if (!token || !claims) throw unauthorized();

      const row = await db.refreshToken.findUnique({ where: { id: claims.jti } });
      if (!row || row.tokenHash !== hashToken(token)) throw unauthorized();

      // Atomic claim: only one concurrent caller can flip usedAt from null.
      const claimed = await db.refreshToken.updateMany({
        where: { id: row.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        await revokeFamily(row.familyId); // reuse of a spent/revoked token: assume theft
        throw unauthorized();
      }

      const user = await db.appUser.findUnique({ where: { id: row.userId } });
      if (!user || !user.active) {
        await revokeFamily(row.familyId);
        throw unauthorized();
      }
      return issue(user.id, row.familyId);
    },

    async logout(token: string | undefined) {
      const claims = token ? verifyRefresh(config.JWT_REFRESH_SECRET, token) : null;
      if (claims) await revokeFamily(claims.familyId);
    },
  };
}
