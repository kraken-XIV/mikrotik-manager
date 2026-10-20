/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/db/migrations/**',
    '!src/index.ts',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  // Measured independent v0.75 no-PG baseline: 39.24/37.12/35.82/40.10%.
  // Establish new floors only; preserve/review any upstream ratchets at v1.0.
  coverageThreshold: { global: { statements: 39, branches: 37, functions: 35, lines: 40 } },
};
