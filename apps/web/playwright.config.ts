import { defineConfig, devices } from '@playwright/test';
import { API_PORT, WEB_PORT, apiEnv } from './e2e/env';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // One database, so one worker: tests that add questions must not race each other.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Reset and seed the end-to-end database, then start the API on it.
      command: 'npx tsx ../web/e2e/prepare.ts && npx tsx src/server.ts',
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/health`,
      env: apiEnv() as Record<string, string>,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { ...process.env, API_PROXY_TARGET: `http://localhost:${API_PORT}` } as Record<
        string,
        string
      >,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
