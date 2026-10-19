import type { AccentVars } from './accents';

export type AccentSelection = import('./accents').AccentId | 'custom';
export const DEFAULT_CUSTOM_ACCENT = '#7c3aed';

/** Only an opaque six-digit hex colour may cross the storage/CSS boundary. */
export function normalizeCustomColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

type Rgb = [number, number, number];
function rgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
function hex(channels: Rgb): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
function mix(channels: Rgb, target: number, amount: number): Rgb {
  return channels.map((channel) => Math.round(channel + (target - channel) * amount)) as Rgb;
}
function luminance(channels: Rgb): number {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Derive readable mode-specific tones, preserving the chosen colour when safe.
 * The bounds also protect accent links against the deepest neutral card surfaces,
 * not just button labels. Presets remain completely unchanged. */
export function getCustomAccentVars(color: string, mode: 'light' | 'dark'): AccentVars {
  const seed = rgb(normalizeCustomColor(color) ?? DEFAULT_CUSTOM_ACCENT);
  let tone = seed;
  const dark = mode === 'dark';
  for (let step = 0; step <= 100; step++) {
    tone = mix(seed, dark ? 255 : 0, step / 100);
    const lightness = luminance(tone);
    if (dark ? lightness >= 0.35 : lightness <= 0.12) break;
  }
  return {
    accent: hex(tone),
    accent2: hex(mix(tone, dark ? 255 : 0, 0.15)),
    accentSoft: `rgba(${tone.join(', ')}, 0.1)`,
    accentFg: dark ? '#0e0f12' : '#ffffff',
  };
}
