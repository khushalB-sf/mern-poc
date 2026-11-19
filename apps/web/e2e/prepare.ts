import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { E2E_DB, apiEnv, e2eDatabaseUrl } from './env';

/** A fresh, seeded database for every run. Runs as the first half of the API server's start command. */
async function prepare() {
  const target = new URL(e2eDatabaseUrl());
  const admin = new pg.Client({ connectionString: new URL('/postgres', target).toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${E2E_DB}`);
  } finally {
    await admin.end();
  }
  const api = fileURLToPath(new URL('../../api/', import.meta.url));
  const env = apiEnv() as NodeJS.ProcessEnv;
  const run = (args: string[]) =>
    execFileSync(process.execPath, args, { cwd: api, env, stdio: 'pipe' });
  run(['../../node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  run(['../../node_modules/tsx/dist/cli.mjs', 'src/seed/run.ts']);
}

await prepare();
