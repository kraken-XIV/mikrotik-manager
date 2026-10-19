import { describe, expect,it } from 'vitest';

import {
  ACCENT_CSS_VARS,
  ACCENT_PRESETS,
  type AccentPreset,
  DEFAULT_ACCENT,
  getAccentPreset,
} from './accents';

/**
 * The blue preset is load-bearing: it must equal the historical `:root` and
 * `.dark` values in index.css exactly, because the store removes the inline
 * properties for the default and lets the stylesheet render as it always has.
 * If you retune blue, retune index.css in the same commit — this test is the
 * rope that ties them together.
 */
const BLUE_LIGHT_EXPECTED = {
  accent: '#2563eb',
  accent2: '#1d4ed8',
  accentSoft: '#eff6ff',
  accentFg: '#ffffff',
};
const BLUE_DARK_EXPECTED = {
  accent: '#60a5fa',
  accent2: '#3b82f6',
  accentSoft: 'rgba(96, 165, 250, 0.1)',
  accentFg: '#0e0f12',
};

function assertComplete(preset: AccentPreset): void {
  for (const mode of ['light', 'dark'] as const) {
    const vars = preset[mode];
    expect(vars.accent, `${preset.id}.${mode}.accent`).toBeTruthy();
    expect(vars.accent2, `${preset.id}.${mode}.accent2`).toBeTruthy();
    expect(vars.accentSoft, `${preset.id}.${mode}.accentSoft`).toBeTruthy();
    expect(vars.accentFg, `${preset.id}.${mode}.accentFg`).toBeTruthy();
    // Every value must be something CSS can eat: hex, rgb/a, or a var() chain.
    for (const [key, value] of Object.entries(vars)) {
      expect(value, `${preset.id}.${mode}.${key}`).toMatch(
        /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|var\()/,
      );
    }
  }
  expect(preset.swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
  expect(preset.label.length).toBeGreaterThan(0);
}

describe('accent presets', () => {
  it('offers the default blue plus several alternatives', () => {
    expect(ACCENT_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(ACCENT_PRESETS[0].id).toBe('blue');
    expect(DEFAULT_ACCENT).toBe('blue');
  });

  it('ids are unique — a duplicate would make one swatch unreachable', () => {
    const ids = ACCENT_PRESETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset defines all four variables in both colour schemes', () => {
    ACCENT_PRESETS.forEach(assertComplete);
  });

  it('blue matches the historical index.css palette exactly', () => {
    const blue = getAccentPreset('blue');
    expect(blue.light).toEqual(BLUE_LIGHT_EXPECTED);
    expect(blue.dark).toEqual(BLUE_DARK_EXPECTED);
  });

  it('ACCENT_CSS_VARS names the four properties the store writes', () => {
    expect(ACCENT_CSS_VARS).toEqual(['--accent', '--accent-2', '--accent-soft', '--accent-fg']);
  });

  it('unknown ids fall back to the default rather than undefined values', () => {
    // A tampered localStorage payload is the realistic path here.
    const preset = getAccentPreset('not-a-real-accent' as never);
    expect(preset.id).toBe('blue');
  });
});
