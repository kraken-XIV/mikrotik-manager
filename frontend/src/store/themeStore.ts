import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  ACCENT_CSS_VARS,
  ACCENT_PRESETS,
  type AccentId,
  DEFAULT_ACCENT,
  getAccentPreset,
} from '../theme/accents';
import {
  type AccentSelection,
  DEFAULT_CUSTOM_ACCENT,
  getCustomAccentVars,
  normalizeCustomColor,
} from '../theme/customAccent';

/**
 * What the user picked. 'system' follows the OS `prefers-color-scheme` and
 * tracks it live: flipping the OS setting re-evaluates without a reload.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
/** What is actually on screen right now. */
export type EffectiveTheme = 'light' | 'dark';

/**
 * A surface scheme sits on top of light/dark: 'high-contrast' strengthens
 * ink and borders in both colour schemes, 'midnight' deepens the dark
 * surfaces further. Orthogonal to the accent by design — schemes change
 * neutrals, accents change the brand colour.
 */
export type SurfaceScheme = 'default' | 'high-contrast' | 'midnight';
const SURFACE_SCHEMES: SurfaceScheme[] = ['default', 'high-contrast', 'midnight'];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Pure so the FOUC guard and the hook can share one definition. */
export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): EffectiveTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
  );
}

/** Type guard for ids read back out of user-writable localStorage. */
function isAccentId(value: unknown): value is AccentId {
  return ACCENT_PRESETS.some((a) => a.id === value);
}

/** Type guard for the persisted surface scheme (localStorage is user-writable). */
function isSurfaceScheme(value: unknown): value is SurfaceScheme {
  return SURFACE_SCHEMES.includes(value as SurfaceScheme);
}

/** Select only validated data; persisted JSON must never replace action methods. */
function readPreferences(
  value: unknown,
): Pick<ThemeState, 'theme' | 'accent' | 'scheme' | 'customColor'> {
  const stored =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const customColor = normalizeCustomColor(stored.customColor);
  return {
    customColor: customColor ?? DEFAULT_CUSTOM_ACCENT,
    theme: stored.theme === 'dark' || stored.theme === 'system' ? stored.theme : 'light',
    accent:
      stored.accent === 'custom' && customColor
        ? 'custom'
        : isAccentId(stored.accent)
          ? stored.accent
          : DEFAULT_ACCENT,
    scheme: isSurfaceScheme(stored.scheme) ? stored.scheme : 'default',
  };
}

/**
 * Writes the accent preset as inline custom properties on <html>.
 *
 * Inline properties win over both the `:root` and `.dark` rules in index.css,
 * which is the whole trick: one function covers both colour schemes and no
 * per-accent CSS needs to exist. The default ('blue') removes the inline
 * properties instead of setting them, so with no accent chosen the stylesheet
 * values apply exactly as they always have — existing installs cannot see any
 * difference from this change.
 */
function applyAccentVars(
  accent: AccentSelection,
  effective: EffectiveTheme,
  customColor: string,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (accent === DEFAULT_ACCENT) {
    for (const variable of ACCENT_CSS_VARS) root.style.removeProperty(variable);
    return;
  }
  const preset = getAccentPreset(accent === 'custom' ? DEFAULT_ACCENT : accent);
  const vars =
    accent === 'custom'
      ? getCustomAccentVars(customColor, effective)
      : effective === 'dark'
        ? preset.dark
        : preset.light;
  root.style.setProperty('--accent', vars.accent);
  root.style.setProperty('--accent-2', vars.accent2);
  root.style.setProperty('--accent-soft', vars.accentSoft);
  root.style.setProperty('--accent-fg', vars.accentFg);
}

/**
 * Writes the surface scheme as a data attribute on <html>; 'default' removes
 * it entirely so existing installs and the stylesheet defaults stay untouched.
 * The scheme blocks in index.css scope themselves (high-contrast per scheme,
 * midnight under .dark), so no scheme CSS lives anywhere else.
 */
function applySurfaceScheme(scheme: SurfaceScheme): void {
  if (typeof document === 'undefined') return;
  if (scheme === 'default') document.documentElement.removeAttribute('data-scheme');
  else document.documentElement.setAttribute('data-scheme', scheme);
}

function applyAll(
  preference: ThemePreference,
  accent: AccentSelection,
  scheme: SurfaceScheme = 'default',
  customColor = DEFAULT_CUSTOM_ACCENT,
): void {
  if (typeof document === 'undefined') return;
  const effective = resolveEffectiveTheme(preference, systemPrefersDark());
  document.documentElement.classList.toggle('dark', effective === 'dark');
  applyAccentVars(accent, effective, customColor);
  applySurfaceScheme(scheme);
}

/**
 * Live OS-scheme tracking. A 'system' preference that is never re-evaluated is
 * a lie: the whole point is that dark mode arrives when the OS decides, not
 * on the next reload. One MediaQueryList is created lazily and shared by the
 * DOM applier and the useEffectiveTheme() subscription.
 */
const systemThemeSubscribers = new Set<() => void>();
let watchedMedia: MediaQueryList | null = null;

function ensureSystemWatch(): void {
  if (watchedMedia || typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return;
  watchedMedia = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    const { theme, accent, scheme, customColor } = useThemeStore.getState();
    // Re-apply the DOM regardless of preference: only 'system' changes the
    // colour scheme, but re-applying is idempotent and simpler to reason about.
    applyAll(theme, accent, scheme, customColor);
    for (const notify of systemThemeSubscribers) notify();
  };
  if (typeof watchedMedia.addEventListener === 'function')
    watchedMedia.addEventListener('change', onChange);
  else if ('addListener' in watchedMedia && typeof watchedMedia.addListener === 'function')
    watchedMedia.addListener(onChange);
}

interface ThemeState {
  theme: ThemePreference;
  accent: AccentSelection;
  customColor: string;
  scheme: SurfaceScheme;
  setTheme: (theme: ThemePreference) => void;
  setAccent: (accent: AccentSelection) => void;
  setCustomColor: (color: string) => void;
  setScheme: (scheme: SurfaceScheme) => void;
  /** light → dark → system → light. Kept for the login-page quick toggle. */
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      accent: DEFAULT_ACCENT,
      customColor: DEFAULT_CUSTOM_ACCENT,
      scheme: 'default',
      setTheme: (theme) => {
        set({ theme });
        applyAll(theme, get().accent, get().scheme, get().customColor);
      },
      setAccent: (accent) => {
        set({ accent });
        applyAll(get().theme, accent, get().scheme, get().customColor);
      },
      setCustomColor: (color) => {
        const customColor = normalizeCustomColor(color);
        if (!customColor) return;
        set({ customColor, accent: 'custom' });
        applyAll(get().theme, 'custom', get().scheme, customColor);
      },
      setScheme: (scheme) => {
        set({ scheme });
        applyAll(get().theme, get().accent, scheme, get().customColor);
      },
      toggleTheme: () => {
        const order: ThemePreference[] = ['light', 'dark', 'system'];
        const next = order[(order.indexOf(get().theme) + 1) % order.length];
        get().setTheme(next);
      },
    }),
    {
      // Same key the light/dark toggle always used. Old payloads carry only
      // `theme` and still load; `accent` simply keeps its initial value.
      name: 'mikrotik-theme',
      partialize: ({ theme, accent, scheme, customColor }) => ({
        theme,
        accent,
        scheme,
        customColor,
      }),
      merge: (persisted, current) => ({ ...current, ...readPreferences(persisted) }),
      onRehydrateStorage: () => (state) => {
        if (state)
          applyAll(state.theme, state.accent, state.scheme ?? 'default', state.customColor);
      },
    },
  ),
);

/**
 * Resolved scheme for consumers that need light/dark, not the preference —
 * logo variants, the circuit background, React Flow's `.dark` class. Re-renders
 * when the OS scheme flips while 'system' is selected.
 */
export function useEffectiveTheme(): EffectiveTheme {
  const preference = useThemeStore((s) => s.theme);
  ensureSystemWatch();
  return useSyncExternalStore(
    (notify) => {
      systemThemeSubscribers.add(notify);
      return () => {
        systemThemeSubscribers.delete(notify);
      };
    },
    () => resolveEffectiveTheme(preference, systemPrefersDark()),
    () => 'light' as EffectiveTheme,
  );
}

/**
 * Pre-React boot for main.tsx. Reads the persisted payload directly rather
 * than waiting for zustand's async rehydration, so the first paint already
 * has the right `.dark` class and accent variables — the same reason the old
 * light/dark guard existed. Unknown values fall back to defaults rather than
 * throwing: localStorage is unavailable in sandboxed iframes, and the payload
 * is user-writable.
 */
export function initThemeFromStorage(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  let preferences = readPreferences(null);
  try {
    const raw = localStorage.getItem('mikrotik-theme');
    const payload: unknown = raw ? JSON.parse(raw) : null;
    if (payload && typeof payload === 'object' && 'state' in payload) {
      preferences = readPreferences(payload.state);
    }
  } catch {
    // Storage may be unavailable or contain malformed JSON. Use safe defaults.
  }
  applyAll(preferences.theme, preferences.accent, preferences.scheme, preferences.customColor);
  // Authenticated deep links may never mount a useEffectiveTheme consumer.
  // System tracking must therefore start at boot, not only on the login page.
  ensureSystemWatch();
}
