import { loadConfig } from '../config/env.js';
import { createDb } from '../db/prisma.js';
import pino from 'pino';
import { bootstrapAdmin } from './bootstrap.js';
import { isEmpty, seed } from './seed.js';

// Usage: run.ts [--admin] [--if-empty]
//   --admin      create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when there is none
//   --if-empty   seed demo data when the database is empty (without the flag it refuses a non-empty one)
// With neither flag it is the plain seed.
const ifEmpty = process.argv.includes('--if-empty');
const admin = process.argv.includes('--admin');
const config = loadConfig();
const db = createDb(config.DATABASE_URL);

try {
  if (admin) {
    if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
      console.log('bootstrap: ADMIN_EMAIL and ADMIN_PASSWORD not set, skipping');
    } else {
      const r = await bootstrapAdmin(db, pino({ level: 'silent' }), {
        email: config.ADMIN_EMAIL,
        password: config.ADMIN_PASSWORD,
      });
      console.log(`bootstrap: admin ${r}`);
    }
  }
  if (!admin || ifEmpty) {
    if (!(await isEmpty(db))) {
      console.log(
        ifEmpty ? 'seed: database not empty, skipping' : 'seed: database not empty, refusing',
      );
      process.exitCode = ifEmpty ? 0 : 1;
    } else {
      const t = Date.now();
      const r = await seed(db, { password: config.SEED_PASSWORD });
      console.log(`seed: ${JSON.stringify(r)} in ${Date.now() - t} ms`);
    }
  }
} finally {
  await db.$disconnect();
}
