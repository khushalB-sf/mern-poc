import { loadConfig } from '../config/env.js';
import { createDb } from '../db/prisma.js';
import { isEmpty, seed } from './seed.js';

// Usage: run.ts [--if-empty]   (without the flag, refuses to touch a non-empty database)
const ifEmpty = process.argv.includes('--if-empty');
const config = loadConfig();
const db = createDb(config.DATABASE_URL);

try {
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
} finally {
  await db.$disconnect();
}
