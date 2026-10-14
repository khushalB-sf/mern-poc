import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // Integration tests share one Postgres database; run files one at a time (ADR-011).
    fileParallelism: false,
  },
});
