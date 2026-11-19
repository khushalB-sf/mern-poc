import pino from 'pino';
import { loadConfig } from './config/env.js';
import { createDb } from './db/prisma.js';
import { createApp } from './http/app.js';
import { useRateLimitStore } from './http/rateLimit.js';
import { redisStoreFactory } from './http/redisStore.js';
import { startMaintenance } from './maintenance.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const db = createDb(config.DATABASE_URL, { statementTimeoutMs: config.DB_STATEMENT_TIMEOUT_MS });

const redis = config.REDIS_URL ? redisStoreFactory(config.REDIS_URL) : undefined;
if (redis) useRateLimitStore(redis.factory); // before createApp: the limiters pick the store up when created
const app = createApp({ config, logger, db });
const maintenance = startMaintenance(db, logger);
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  // Hard stop if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
  clearInterval(maintenance);
  server.close(async () => {
    redis?.client.disconnect();
    await db.$disconnect();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
