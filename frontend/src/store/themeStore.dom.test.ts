// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useThemeStore } from './themeStore';

/**
 * The class-based dark mode: the store is the single writer of the `dark`
 * class on <html>, so the UI (and any screenshot flow) can trust it. It also
 * persists the choice, and re-applies it on the next load.
 */
describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: 'light' });
    document.documentElement.classList.remove('dark');
  });

  it('toggles the dark class on the document element', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(useThemeStore.getState().theme).toBe('dark');

    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('flips with toggleTheme', () => {
    useThemeStore.getState().toggleTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    useThemeStore.getState().toggleTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists the choice across reloads', async () => {
    useThemeStore.getState().setTheme('dark');
    expect(localStorage.getItem('mikrotik-theme')).toContain('dark');

    // A fresh module instance rehydrates from storage and re-applies the class.
    vi.resetModules();
    document.documentElement.classList.remove('dark');
    const { useThemeStore: reloaded } = await import('./themeStore');
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(reloaded.getState().theme).toBe('dark');
    });
  });

  it('rehydrates light mode without the dark class', async () => {
    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({ state: { theme: 'light' }, version: 0 }),
    );
    vi.resetModules();
    const { useThemeStore: reloaded } = await import('./themeStore');
    await vi.waitFor(() => expect(reloaded.getState().theme).toBe('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
