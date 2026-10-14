import '../src/config/env.js'; // side effect: loads the repo-root .env

/** Same server as DATABASE_URL, but the isolated `qb_test` database. */
export function testDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required to run integration tests');
  const url = new URL(base);
  url.pathname = '/qb_test';
  return url.toString();
}
