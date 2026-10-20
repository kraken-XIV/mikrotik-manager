import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    execArgv: ['--no-experimental-webstorage'],
    include: ['src/**/*.test.ts'],
  },
});
