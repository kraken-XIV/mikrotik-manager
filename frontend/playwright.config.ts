import { defineConfig, devices } from '@playwright/test';

/**
 * Browser e2e for the theming layer (and, later, the rest of the golden
 * paths). Runs against the Vite dev server by default:
 *
 *   npm run dev          # terminal 1
 *   npm run e2e          # terminal 2
 *
 * No backend is required for the current suite: the login page renders
 * standalone and degrades gracefully when its status calls fail, and every
 * /api/* request is intercepted so the tests are deterministic and hermetic.
 * A full-stack job (compose + seeded admin + real endpoints) is the natural
 * next step and can follow the pattern ci.yml already uses for the Postgres
 * backup round-trip.
 */
export default defineConfig({
  testDir: './e2e',
  // Kept deliberately separate from the vitest glob so neither suite can
  // accidentally run the other's tests.
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  // Starts the dev server when none is running; reuses an already-running one
  // so `npm run dev` + `npm run e2e` in separate terminals does not collide.
  // A dedicated port (vite.config.ts uses 3000 for day-to-day dev, where the
  // API proxy targets localhost:3001) keeps e2e runs from colliding with a
  // dev session. CLI flags override the config's port; --strictPort fails
  // loudly rather than silently drifting to 5174 and breaking baseURL.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
