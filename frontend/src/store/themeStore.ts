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

/**
 * What the user picked. 'system' follows the OS `prefers-color-scheme` and
 * tracks it live: flipping the OS setting re-evaluates without a reload.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
/** What is actually on screen right now. */
export type EffectiveTheme = 'light' | 'dark';

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
function isAccentId(value: string): value is AccentId {
  return ACCENT_PRESETS.some((a) => a.id === value);
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
function applyAccentVars(accent: AccentId, effective: EffectiveTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (accent === DEFAULT_ACCENT) {
    for (const variable of ACCENT_CSS_VARS) root.style.removeProperty(variable);
    return;
  }
  const vars = getAccentPreset(accent)[effective];
  root.style.setProperty('--accent', vars.accent);
  root.style.setProperty('--accent-2', vars.accent2);
  root.style.setProperty('--accent-soft', vars.accentSoft);
  root.style.setProperty('--accent-fg', vars.accentFg);
}

function applyAll(preference: ThemePreference, accent: AccentId): void {
  if (typeof document === 'undefined') return;
  const effective = resolveEffectiveTheme(preference, systemPrefersDark());
  document.documentElement.classList.toggle('dark', effective === 'dark');
  applyAccentVars(accent, effective);
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
    const { theme, accent } = useThemeStore.getState();
    // Re-apply the DOM regardless of preference: only 'system' changes the
    // scheme, but re-applying is idempotent and simpler to reason about.
    applyAll(theme, accent);
    for (const notify of systemThemeSubscribers) notify();
  };
  if (typeof watchedMedia.addEventListener === 'function')
    watchedMedia.addEventListener('change', onChange);
  else if ('addListener' in watchedMedia && typeof watchedMedia.addListener === 'function')
    watchedMedia.addListener(onChange);
}

interface ThemeState {
  theme: ThemePreference;
  accent: AccentId;
  setTheme: (theme: ThemePreference) => void;
  setAccent: (accent: AccentId) => void;
  /** light → dark → system → light. Kept for the login-page quick toggle. */
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      accent: DEFAULT_ACCENT,
      setTheme: (theme) => {
        set({ theme });
        applyAll(theme, get().accent);
      },
      setAccent: (accent) => {
        set({ accent });
        applyAll(get().theme, accent);
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
      onRehydrateStorage: () => (state) => {
        if (state) applyAll(state.theme, state.accent);
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
  let preference: ThemePreference = 'light';
  let accent: AccentId = DEFAULT_ACCENT;
  try {
    const raw = localStorage.getItem('mikrotik-theme');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: string; accent?: string } };
      const storedTheme = parsed?.state?.theme;
      if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system')
        preference = storedTheme;
      const storedAccent = parsed?.state?.accent;
      if (storedAccent && isAccentId(storedAccent)) accent = storedAccent;
    }
  } catch {
    // localStorage unavailable (e.g. sandboxed iframe) or a malformed payload —
    // the defaults are the honest answer, not a crash before first paint.
  }
  applyAll(preference, accent);
}
