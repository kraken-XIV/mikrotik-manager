/**
 * Accent presets for the theming engine.
 *
 * The accent is the platform's "brand" colour: primary buttons, focus rings,
 * the sidebar's active item, links and the first chart series all read the
 * four `--accent*` custom properties. A preset provides those four variables
 * for each colour scheme, applied as inline custom properties on <html> by
 * the theme store (see store/themeStore.ts).
 *
 * `blue` is the default and deliberately matches the historical CSS values in
 * index.css exactly — when no accent is chosen the store writes no inline
 * properties at all, so existing installs render byte-identically. The test
 * for that lives in src/theme/accents.test.ts; change both together.
 *
 * Contrast rules of thumb used when picking values:
 * - light mode: `accent` is the saturated tone, `accent-fg` is white, and
 *   `accent-soft` is the 50-step tint of the same hue (a background that
 *   stays readable behind dark ink).
 * - dark mode: `accent` lifts to a lighter step so it reads on near-black
 *   surfaces, `accent-soft` becomes a ~10% alpha wash, and `accent-fg`
 *   returns to the dark-mode ink colour rather than white.
 */

export type AccentId = 'blue' | 'violet' | 'emerald' | 'rose' | 'amber' | 'teal';

export interface AccentVars {
  /** The main accent tone. */
  accent: string;
  /** A darker companion used for hovers and gradients (light mode). */
  accent2: string;
  /** A quiet background tint for selected rows, chips and chart fills. */
  accentSoft: string;
  /** Foreground colour that is readable on top of `accent`. */
  accentFg: string;
}

export interface AccentPreset {
  id: AccentId;
  label: string;
  /** Representative hex for picker swatches. */
  swatch: string;
  light: AccentVars;
  dark: AccentVars;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'blue',
    label: 'Blue',
    swatch: '#2563eb',
    light: { accent: '#2563eb', accent2: '#1d4ed8', accentSoft: '#eff6ff', accentFg: '#ffffff' },
    dark: {
      accent: '#60a5fa',
      accent2: '#3b82f6',
      accentSoft: 'rgba(96, 165, 250, 0.1)',
      accentFg: '#0e0f12',
    },
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: '#7c3aed',
    light: { accent: '#7c3aed', accent2: '#6d28d9', accentSoft: '#f5f3ff', accentFg: '#ffffff' },
    dark: {
      accent: '#a78bfa',
      accent2: '#8b5cf6',
      accentSoft: 'rgba(167, 139, 250, 0.1)',
      accentFg: '#0e0f12',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#047857',
    light: { accent: '#047857', accent2: '#065f46', accentSoft: '#ecfdf5', accentFg: '#ffffff' },
    dark: {
      accent: '#34d399',
      accent2: '#10b981',
      accentSoft: 'rgba(52, 211, 153, 0.1)',
      accentFg: '#0e0f12',
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: '#e11d48',
    light: { accent: '#e11d48', accent2: '#be123c', accentSoft: '#fff1f2', accentFg: '#ffffff' },
    dark: {
      accent: '#fb7185',
      accent2: '#f43f5e',
      accentSoft: 'rgba(251, 113, 133, 0.1)',
      accentFg: '#0e0f12',
    },
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#b45309',
    light: { accent: '#b45309', accent2: '#92400e', accentSoft: '#fffbeb', accentFg: '#ffffff' },
    dark: {
      accent: '#fbbf24',
      accent2: '#f59e0b',
      accentSoft: 'rgba(251, 191, 36, 0.1)',
      accentFg: '#0e0f12',
    },
  },
  {
    id: 'teal',
    label: 'Teal',
    swatch: '#0f766e',
    light: { accent: '#0f766e', accent2: '#115e59', accentSoft: '#f0fdfa', accentFg: '#ffffff' },
    dark: {
      accent: '#2dd4bf',
      accent2: '#14b8a6',
      accentSoft: 'rgba(45, 212, 191, 0.1)',
      accentFg: '#0e0f12',
    },
  },
];

export const DEFAULT_ACCENT: AccentId = 'blue';

export function getAccentPreset(id: AccentId): AccentPreset {
  const found = ACCENT_PRESETS.find((a) => a.id === id);
  // Unknown ids cannot come from typed callers; a tampered localStorage payload
  // can. Falling back to the default keeps the picker honest instead of
  // writing undefined CSS variables.
  return found ?? ACCENT_PRESETS[0];
}

/** The four CSS custom property names a preset maps onto. */
export const ACCENT_CSS_VARS = ['--accent', '--accent-2', '--accent-soft', '--accent-fg'] as const;
