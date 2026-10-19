#!/usr/bin/env node
/**
 * Coverage ratchet helper. Reads coverage/coverage-summary.json (produced by
 * `npm run test:coverage`) and compares the measured whole-app coverage with
 * the floors in vitest.config.ts.
 *
 *   npm run coverage:ratchet          # report current vs floors
 *   npm run coverage:ratchet -- --write
 *                                     # raise the floors to what the current
 *                                     # run supports (never lowers them)
 *
 * The ratchet policy lives in docs/testing.md: floors block regressions, they
 * are not targets. Raise them whenever coverage improves; never lower them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const summary = JSON.parse(readFileSync(join(root, 'coverage', 'coverage-summary.json'), 'utf8'));
const configPath = join(root, 'vitest.config.ts');
let config = readFileSync(configPath, 'utf8');

const measured = {
  statements: Math.floor(summary.total.statements.pct),
  branches: Math.floor(summary.total.branches.pct),
  functions: Math.floor(summary.total.functions.pct),
  lines: Math.floor(summary.total.lines.pct),
};

const blockMatch = config.match(/thresholds: \{([\s\S]*?)\},/);
if (!blockMatch) {
  console.error('Could not find the thresholds block in vitest.config.ts');
  process.exit(1);
}
const block = blockMatch[1];

const current = {};
for (const metric of Object.keys(measured)) {
  const match = block.match(new RegExp(`(?:^|\\s)${metric}: (\\d+),`, 'm'));
  if (!match) {
    console.error(`Could not find the ${metric} floor in vitest.config.ts`);
    process.exit(1);
  }
  current[metric] = Number(match[1]);
}

const write = process.argv.includes('--write');
let changed = false;

console.log('Metric      measured (floor)   configured floor');
for (const [metric, value] of Object.entries(measured)) {
  const verdict = value > current[metric]
    ? (write ? 'RAISED' : 'can raise')
    : value < current[metric] ? 'REGRESSED' : 'holds';
  console.log(`${metric.padEnd(12)}${String(value).padEnd(19)}${current[metric]}  ${verdict}`);
  if (write && value > current[metric]) {
    config = config.replace(new RegExp(`((?:^|\\s)${metric}: )(\\d+),`), `$1${value},`);
    changed = true;
  }
}

if (write) {
  if (changed) {
    writeFileSync(configPath, config);
    console.log('\nvitest.config.ts floors updated. Commit the change with your tests.');
  } else {
    console.log('\nNo floor to raise: coverage did not improve past the configured floors.');
  }
} else if (Object.keys(measured).some((m) => measured[m] < current[m])) {
  console.log('\nCoverage is below the floors — CI will fail. Add tests or fix the loss.');
  process.exitCode = 1;
}
