import { describe, expect, it } from 'vitest';

import {
  ACCENT_CSS_VARS,
  ACCENT_PRESETS,
  type AccentPreset,
  DEFAULT_ACCENT,
  getAccentPreset,
} from './accents';
import { DEFAULT_CUSTOM_ACCENT, getCustomAccentVars, normalizeCustomColor } from './customAccent';

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
  for (const [mode, vars] of [
    ['light', preset.light],
    ['dark', preset.dark],
  ] as const) {
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

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const channel = parseInt(part, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

it('normal and hover button text meets WCAG AA in every accent and mode', () => {
  for (const preset of ACCENT_PRESETS) {
    for (const [mode, vars] of [
      ['light', preset.light],
      ['dark', preset.dark],
    ] as const) {
      for (const [background, colour] of [
        ['accent', vars.accent],
        ['accent2', vars.accent2],
      ] as const) {
        const foreground = luminance(vars.accentFg);
        const surface = luminance(colour);
        const contrast =
          (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05);
        expect(contrast, `${preset.id}.${mode}.${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

// Independent luminance/contrast checks cover saturated, grayscale and boundary
// colours; a valid native picker choice must never produce unreadable labels.
describe('custom accent palettes', () => {
  it('accepts only complete hex colours and rejects CSS/storage injection', () => {
    expect(normalizeCustomColor('#Aa00Ff')).toBe('#aa00ff');
    for (const value of [null, {}, '#abc', '#12345678', 'red', '#ff0000; color:red', 'url(x)']) {
      expect(normalizeCustomColor(value)).toBeNull();
    }
  });

  it('generates readable normal/hover labels and links across the RGB gamut', () => {
    const values = [0, 51, 102, 153, 204, 255];
    for (const r of values)
      for (const g of values)
        for (const b of values) {
          const seed = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          for (const mode of ['light', 'dark'] as const) {
            const palette = getCustomAccentVars(seed, mode);
            for (const colour of [palette.accent, palette.accent2]) {
              const fg = luminance(palette.accentFg);
              const bg = luminance(colour);
              expect(
                (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
                `${seed}/${mode}`,
              ).toBeGreaterThanOrEqual(4.5);
              // Darkest light / brightest dark neutral surface across all schemes.
              const surface = luminance(mode === 'light' ? '#e5e3d8' : '#23262c');
              expect(
                (Math.max(surface, bg) + 0.05) / (Math.min(surface, bg) + 0.05),
              ).toBeGreaterThanOrEqual(4.5);
            }
          }
        }
  });

  it('falls back safely for malformed runtime values', () => {
    expect(getCustomAccentVars('url(attacker)', 'light')).toEqual(
      getCustomAccentVars(DEFAULT_CUSTOM_ACCENT, 'light'),
    );
  });
});
