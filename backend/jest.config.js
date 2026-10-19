/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/db/migrations/**', '!src/index.ts'],
  coverageReporters: ['text', 'lcov'],
  // Coverage ratchet (docs/testing.md): floors, not targets. These sit just
  // under the measured baseline of the run that introduced them. The
  // PG-backed e2e tests run in CI only and cover a superset of the local
  // run, so CI sits above these floors. Raise them when coverage improves;
  // never lower them to pass.
  coverageThreshold: {
    global: {
      statements: 39,
      branches: 37,
      functions: 35,
      lines: 40,
    },
  },
};
