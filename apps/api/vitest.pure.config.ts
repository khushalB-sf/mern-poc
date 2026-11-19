import { defineConfig } from 'vitest/config';

// Only the tests that need no database, so mutation testing (Stryker) can run them hundreds of times.
export default defineConfig({
  test: { include: ['test/properties.test.ts', 'test/pure.examples.test.ts', 'test/unit.test.ts'] },
});
