import pino from 'pino';
import { loadConfig } from './config/env.js';
import { createDb } from './db/prisma.js';
import { createApp } from './http/app.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const db = createDb(config.DATABASE_URL);

const app = createApp({ config, logger, db });
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  // Hard stop if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
