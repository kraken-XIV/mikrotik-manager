import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The suite is mostly pure-function logic, so node stays the default and
    // the default run stays fast. Tests that need a DOM (components, hooks,
    // stores touching documentElement) declare jsdom per file with a
    // `// @vitest-environment jsdom` docblock, which keeps the environment an
    // explicit, greppable choice at the top of every DOM test.
    environment: 'node',
    // Disable Node's native storage in workers; DOM suites use jsdom Storage.
    execArgv: ['--no-experimental-webstorage'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      // json-summary feeds scripts/coverage-ratchet.mjs.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // Everything the app ships, except the DOM entry point (exercised by
      // the Playwright flows, not the unit run) and the tests themselves.
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/**/*.test.*', 'src/test/**'],
      // Initial independent v0.75 baseline: 11.29/7.47/5.58/10.97%.
      // No pre-existing upstream floors are lowered. Re-measure for v1.0.
      thresholds: {
        statements: 11,
        branches: 7,
        functions: 5,
        lines: 10,
      },

    },
  },
});
