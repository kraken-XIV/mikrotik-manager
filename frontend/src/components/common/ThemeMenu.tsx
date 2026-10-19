import clsx from 'clsx';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { type ThemePreference, useThemeStore } from '../../store/themeStore';
import AccentSwatches from './AccentSwatches';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const PREFERENCE_TITLE = new Map<ThemePreference, string>([
  ['light', 'Theme: light — click to change'],
  ['dark', 'Theme: dark — click to change'],
  ['system', 'Theme: follows system — click to change'],
]);

interface ThemeMenuProps {
  /** Extra classes for the trigger button (context-dependent contrast). */
  triggerClassName?: string;
}

/**
 * The theme + accent popover, shared by the TopBar and the login page.
 *
 * One control in both places on purpose: the login page was a bare emoji
 * toggle while the app had a popover, and the two had already drifted (the
 * emoji knew nothing about accents). Closed by outside mousedown or Escape,
 * with focus returned to the trigger so keyboard users are not stranded in a
 * closed menu.
 */
export default function ThemeMenu({ triggerClassName }: ThemeMenuProps) {
  const { theme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    containerRef.current
      ?.querySelector<HTMLButtonElement>('[data-theme-option][aria-pressed="true"]')
      ?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const ThemeIcon = THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? Sun;

  return (
    <div
      className="relative"
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className={clsx('p-[7px] rounded-lg transition-colors', triggerClassName)}
        style={{ color: 'var(--ink-3)' }}
        title={PREFERENCE_TITLE.get(theme)}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-label="Theme and accent settings"
      >
        <ThemeIcon className="w-4 h-4" />
      </button>
      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Theme and accent"
          className="absolute right-0 top-full mt-2 w-56 rounded-xl border shadow-lg p-2 z-50"
          style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              data-theme-option
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] transition-colors"
              style={{ color: 'var(--ink-2)' }}
            >
              <span className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {label}
                {value === 'system' && (
                  <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>
                    (follows OS)
                  </span>
                )}
              </span>
              {theme === value && <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
          <div className="my-2" style={{ borderTop: '1px solid var(--line)' }} />
          <div className="px-2.5 pb-1">
            <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--ink-4)' }}>
              Accent
            </div>
            <AccentSwatches />
          </div>
        </div>
      )}
    </div>
  );
}
