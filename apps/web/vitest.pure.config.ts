import { defineConfig } from 'vitest/config';

// Only the tests that need no browser environment, so mutation testing (Stryker) can run them many times.
export default defineConfig({
  test: {
    include: ['test/filters.test.ts', 'test/filters.property.test.ts', 'test/permissions.test.ts'],
  },
});
