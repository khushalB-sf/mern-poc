import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in dev too: the browser only ever talks to Vite, which forwards /api to the API.
    // That keeps SameSite=Strict cookies working exactly as they do behind nginx.
    proxy: { '/api': { target: 'http://localhost:4000' } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});
