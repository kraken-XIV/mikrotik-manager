import { describe, expect, it } from 'vitest';

import tailwindSource from '../../tailwind.config.js?raw';

/**
 * The design tokens live in three places that must agree: custom properties
 * in index.css, Tailwind colour bridges in tailwind.config.js, and the
 * classes used across src. A class such as `bg-good-bg` only exists if the
 * config maps `good-bg` — Tailwind 3 silently generates nothing for an
 * unmapped name, so a missing bridge is an invisible bug: badges and banners
 * keep their markup but lose their background in both colour schemes.
 *
 * This suite ties the layers together:
 * 1. every colour custom property defined in index.css is bridged in the
 *    Tailwind config;
 * 2. every bridge points back at its index.css variable;
 * 3. every token class actually used in src resolves to a bridged colour.
 *
 * It exists because `bg-good-bg` / `text-accent-fg` / `bg-violet-bg` shipped
 * unbridged once: the markup rendered, the classes did nothing.
 */

/** The colour token stems — index.css custom property names, without `--`. */
const COLOR_STEMS = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'line',
  'line-soft',
  'ink',
  'ink-2',
  'ink-3',
  'ink-4',
  'accent',
  'accent-2',
  'accent-soft',
  'accent-fg',
  'good',
  'good-bg',
  'warn',
  'warn-bg',
  'bad',
  'bad-bg',
  'info',
  'info-bg',
  'violet',
  'violet-bg',
] as const;

/** Bespoke landing surfaces and generative art keep their own palettes. */
const EXCLUDED_FILES = [
  '/src/pages/LoginPage.tsx',
  '/src/pages/ChangePasswordPage.tsx',
  '/src/components/CircuitBackground.tsx',
];

/** All app sources as strings — no node APIs, the test stays environment-agnostic. */
const rawSources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sources = Object.fromEntries(Object.entries(rawSources).filter(([f]) => !f.endsWith('.css')));

/**
 * The token section of tailwind.config.js is exactly `"name": 'var(--name)'`
 * pairs; matching that shape (and only that shape) deliberately ignores the
 * legacy `brand`/`sidebar` hex palettes, which are not design tokens.
 */
const bridgeRe = /'?([a-z0-9-]+)'?:\s*'var\(--([a-z0-9-]+)\)'/g;

const bridges = new Map<string, string>();
for (const [, name, cssVar] of tailwindSource.matchAll(bridgeRe)) bridges.set(name, cssVar);

describe('design-token bridges', () => {
  it('every colour custom property in index.css is bridged in the Tailwind config', () => {
    for (const stem of COLOR_STEMS) {
      expect(bridges.has(stem), `tailwind.config.js colors["${stem}"]`).toBe(true);
    }
  });

  it('every bridge points back at its own custom property', () => {
    // `good-bg` must map to var(--good-bg), never to a lookalike — a drifted
    // bridge would silently recolour everything that consumes the token.
    for (const stem of COLOR_STEMS) {
      expect(bridges.get(stem), stem).toBe(stem);
    }
  });

  it('every token class used in src resolves to a bridged colour', () => {
    const classRe =
      /\b(bg|text|border|ring|divide|fill|stroke|from|via|to|placeholder)-([a-z0-9-]+)\b/g;
    const broken = new Map<string, Set<string>>();
    for (const [file, source] of Object.entries(sources)) {
      if (EXCLUDED_FILES.includes(file) || file.includes('.test.')) continue;
      for (const [, prop, stem] of source.matchAll(classRe)) {
        if (!COLOR_STEMS.includes(stem as (typeof COLOR_STEMS)[number])) continue;
        if (!bridges.has(stem)) {
          const key = `${prop}-${stem}`;
          const files = broken.get(key) ?? new Set<string>();
          files.add(file.replace('/src/', ''));
          broken.set(key, files);
        }
      }
    }
    expect(
      [...broken.entries()].map(
        ([cls, files]) => `${cls} (used in ${[...files].sort().join(', ')})`,
      ),
      'token classes used in src but not bridged in tailwind.config.js',
    ).toEqual([]);
  });
});
