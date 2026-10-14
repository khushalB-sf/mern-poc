import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { testDatabaseUrl } from './testDb.js';

// Creates the qb_test database if needed and applies migrations once per test run.
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['qb_test']);
    if (exists.rowCount === 0) await admin.query('CREATE DATABASE qb_test');
  } finally {
    await admin.end();
  }
  const apiDir = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(
    process.execPath,
    ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    },
  );
}
