// @vitest-environment jsdom
// This suite exercises real DOM behaviour (the `.dark` class, inline custom
// properties, localStorage), so it runs in jsdom via the per-file pragma —
// the rest of the suite stays on the fast node environment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccentPreset } from '../theme/accents';
import { DEFAULT_CUSTOM_ACCENT, getCustomAccentVars } from '../theme/customAccent';
import { initThemeFromStorage, resolveEffectiveTheme, useThemeStore } from './themeStore';

/** jsdom has no matchMedia; the store must both detect its absence and use it when present. */
function stubMatchMedia(matches: boolean): { calls: number; listeners: Set<() => void> } {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    addListener: (fn: () => void) => listeners.add(fn),
    removeListener: (fn: () => void) => listeners.delete(fn),
    onchange: null,
    dispatchEvent: () => false,
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return { calls: 0, listeners };
}

function resetDom(): void {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  localStorage.clear();
  useThemeStore.setState({
    theme: 'light',
    accent: 'blue',
    customColor: DEFAULT_CUSTOM_ACCENT,
  });
}

beforeEach(() => {
  resetDom();
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveEffectiveTheme', () => {
  it('light and dark pass straight through', () => {
    expect(resolveEffectiveTheme('light', true)).toBe('light');
    expect(resolveEffectiveTheme('dark', false)).toBe('dark');
  });

  it('system follows the OS, not the last explicit choice', () => {
    expect(resolveEffectiveTheme('system', false)).toBe('light');
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
  });
});

describe('theme store DOM effects', () => {
  it('default is light with no .dark class', () => {
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setTheme("dark") adds the .dark class; back to light removes it', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('system resolves through matchMedia', () => {
    stubMatchMedia(true);
    useThemeStore.getState().setTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    stubMatchMedia(false);
    useThemeStore.getState().setTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggleTheme cycles light → dark → system → light', () => {
    const store = useThemeStore.getState();
    store.toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    store.toggleTheme();
    expect(useThemeStore.getState().theme).toBe('system');
    store.toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('preferences persist under the historical key', () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().setAccent('emerald');
    const raw = JSON.parse(localStorage.getItem('mikrotik-theme') ?? '{}');
    expect(raw.state.theme).toBe('dark');
    expect(raw.state.accent).toBe('emerald');
  });
});

describe('accent DOM effects', () => {
  it('the default accent writes no inline properties — the stylesheet wins, unchanged', () => {
    useThemeStore.getState().setAccent('violet');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      getAccentPreset('violet').light.accent,
    );
    useThemeStore.getState().setAccent('blue');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--accent-2')).toBe('');
  });

  it('a non-default accent writes all four variables', () => {
    useThemeStore.getState().setAccent('rose');
    const rose = getAccentPreset('rose').light;
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(rose.accent);
    expect(document.documentElement.style.getPropertyValue('--accent-2')).toBe(rose.accent2);
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toBe(rose.accentSoft);
    expect(document.documentElement.style.getPropertyValue('--accent-fg')).toBe(rose.accentFg);
  });

  it('accent variables track the colour scheme: dark mode lifts the tone', () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().setAccent('emerald');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      getAccentPreset('emerald').dark.accent,
    );
    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      getAccentPreset('emerald').light.accent,
    );
  });
});

describe('initThemeFromStorage (the pre-React FOUC guard)', () => {
  it('applies a persisted dark + accent combination before React renders', () => {
    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({ state: { theme: 'dark', accent: 'teal' } }),
    );
    initThemeFromStorage();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      getAccentPreset('teal').dark.accent,
    );
  });

  it('system preference resolves at boot, not after hydration', () => {
    stubMatchMedia(true);
    localStorage.setItem('mikrotik-theme', JSON.stringify({ state: { theme: 'system' } }));
    initThemeFromStorage();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('malformed or tampered payloads fall back to light + default accent', () => {
    localStorage.setItem('mikrotik-theme', '{not json');
    expect(() => initThemeFromStorage()).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');

    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({ state: { theme: 'banana', accent: 'nope' } }),
    );
    expect(() => initThemeFromStorage()).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  it('no stored payload at all leaves the defaults untouched', () => {
    expect(() => initThemeFromStorage()).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});

/**
 * Carried over from the component-test suite: a fresh module instance (what a
 * page reload produces) must rehydrate the persisted preference and accent
 * and re-apply both to the document, not just hold them in state.
 */
describe('rehydration on a fresh module instance', () => {
  it('re-applies dark + accent from storage without any interaction', async () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().setAccent('emerald');
    vi.resetModules();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    const { useThemeStore: reloaded } = await import('./themeStore');
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(reloaded.getState().theme).toBe('dark');
      expect(reloaded.getState().accent).toBe('emerald');
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
        getAccentPreset('emerald').dark.accent,
      );
    });
  });
});

describe('untrusted persisted preference rehydration', () => {
  it('normalizes unknown preferences and cannot overwrite store actions', async () => {
    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({
        state: {
          theme: 'banana',
          accent: { id: 'rose' },
          setTheme: 'not a function',
          setAccent: null,
        },
        version: 0,
      }),
    );
    await useThemeStore.persist.rehydrate();
    const state = useThemeStore.getState();
    expect(state.theme).toBe('light');
    expect(state.accent).toBe('blue');
    expect(typeof state.setTheme).toBe('function');
    expect(typeof state.setAccent).toBe('function');
    expect(() => state.setTheme('dark')).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('older payloads reset missing accent to defaults', async () => {
    useThemeStore.getState().setAccent('rose');
    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({ state: { theme: 'dark' }, version: 0 }),
    );
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState()).toMatchObject({
      theme: 'dark',
      accent: 'blue',
    });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});

it('starts live OS tracking on a deep-link boot without mounting a theme hook', async () => {
  const listeners = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener: (_: string, callback: () => void) => listeners.add(callback),
  };
  window.matchMedia = vi.fn().mockReturnValue(media);
  localStorage.setItem(
    'mikrotik-theme',
    JSON.stringify({ state: { theme: 'system', accent: 'rose' }, version: 0 }),
  );
  vi.resetModules();
  const reloaded = await import('./themeStore');
  reloaded.initThemeFromStorage();
  expect(listeners.size).toBe(1);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  media.matches = true;
  for (const listener of listeners) listener();
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
    getAccentPreset('rose').dark.accent,
  );
});

describe('custom accent storage and mode changes', () => {
  it('persists a validated colour and restores it at boot and rehydration', async () => {
    useThemeStore.getState().setCustomColor('#FF8800');
    expect(useThemeStore.getState()).toMatchObject({ accent: 'custom', customColor: '#ff8800' });
    const raw = localStorage.getItem('mikrotik-theme')!;
    expect(JSON.parse(raw).state.customColor).toBe('#ff8800');
    useThemeStore.getState().setAccent('blue');
    localStorage.setItem('mikrotik-theme', raw);
    initThemeFromStorage();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      getCustomAccentVars('#ff8800', 'light').accent,
    );
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().accent).toBe('custom');
    expect(typeof useThemeStore.getState().setCustomColor).toBe('function');
  });

  it('recomputes custom tones in every mode and keeps the colour when a preset is chosen', () => {
    useThemeStore.getState().setCustomColor('#ff8800');
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      getCustomAccentVars('#ff8800', 'dark').accent,
    );
    stubMatchMedia(false);
    useThemeStore.getState().setTheme('system');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      getCustomAccentVars('#ff8800', 'light').accent,
    );
    useThemeStore.getState().setAccent('blue');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
    useThemeStore.getState().setAccent('custom');
    expect(useThemeStore.getState().customColor).toBe('#ff8800');
  });

  it('rejects invalid custom CSS and cannot rehydrate over the setter', async () => {
    useThemeStore.getState().setCustomColor('url(attacker)');
    expect(useThemeStore.getState().accent).toBe('blue');
    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({
        state: { accent: 'custom', customColor: '#fff; color:red', setCustomColor: null },
        version: 0,
      }),
    );
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState()).toMatchObject({
      accent: 'blue',
      customColor: DEFAULT_CUSTOM_ACCENT,
    });
    expect(typeof useThemeStore.getState().setCustomColor).toBe('function');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});
