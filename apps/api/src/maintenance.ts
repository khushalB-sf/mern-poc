import type { Logger } from 'pino';
import type { Db } from './db/prisma.js';

const DAY = 24 * 3600 * 1000;
const SIX_HOURS = 6 * 3600 * 1000;

/**
 * Housekeeping for a table that only ever grows: refresh tokens (one per refresh, so one per 15 minutes of
 * use). A token that expired a week ago, or was used or revoked a month ago, is of
 * no use to anyone; a session that is still alive is never touched. Returns how many rows went.
 */
export async function purgeExpiredTokens(db: Db, now = Date.now()): Promise<number> {
  const week = new Date(now - 7 * DAY);
  const month = new Date(now - 30 * DAY);
  const tokens = await db.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: week } }, { revokedAt: { lt: month } }, { usedAt: { lt: month } }],
    },
  });
  return tokens.count;
}

/** Runs the purge now and every six hours. The timer never keeps the process alive on shutdown. */
export function startMaintenance(db: Db, logger: Logger) {
  const run = () =>
    purgeExpiredTokens(db).then(
      (n) => n > 0 && logger.info({ removed: n }, 'purged expired tokens'),
      (err) => logger.error({ err }, 'token purge failed'),
    );
  void run();
  return setInterval(() => void run(), SIX_HOURS).unref();
}
