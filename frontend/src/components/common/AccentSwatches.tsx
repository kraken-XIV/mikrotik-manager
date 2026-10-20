import clsx from 'clsx';

import { useEffectiveTheme, useThemeStore } from '../../store/themeStore';
import { ACCENT_PRESETS } from '../../theme/accents';
import { type AccentSelection, getCustomAccentVars } from '../../theme/customAccent';

/**
 * The accent-choosing row shared by the TopBar popover and the Settings
 * Appearance card. Swatches are buttons, not radios: like the theme menu they
 * change an immediate visual preference, and `aria-pressed` is the honest
 * state for a toggle-style control in a row. Each solid bubble uses the exact
 * resolved UI accent, including live OS changes in System mode.
 */
export default function AccentSwatches({ className }: { className?: string }) {
  const effectiveTheme = useEffectiveTheme();
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);
  const customColor = useThemeStore((s) => s.customColor);
  const setCustomColor = useThemeStore((s) => s.setCustomColor);
  const custom = getCustomAccentVars(customColor, effectiveTheme);

  return (
    <div
      className={clsx('flex items-center gap-2 flex-wrap', className)}
      role="group"
      aria-label="Accent colour"
    >
      {ACCENT_PRESETS.map((preset) => {
        const active = accent === preset.id;
        const colour = (effectiveTheme === 'dark' ? preset.dark : preset.light).accent;
        return (
          <button
            type="button"
            key={preset.id}
            onClick={() => setAccent(preset.id)}
            aria-pressed={active}
            aria-label={`Accent colour: ${preset.label}`}
            title={preset.label}
            className={clsx(
              'w-6 h-6 rounded-full transition-transform',
              active ? 'ring-2 ring-offset-2 ring-offset-transparent scale-110' : 'hover:scale-105',
            )}
            style={{
              backgroundColor: colour,
              ...(active ? { boxShadow: `0 0 0 2px ${colour}` } : {}),
            }}
          />
        );
      })}
      <div className="w-full flex flex-wrap items-center gap-2 mt-1">
        <button
          type="button"
          aria-label="Use custom accent"
          aria-pressed={accent === 'custom'}
          onClick={() => setAccent('custom')}
          className="inline-flex items-center gap-1.5 rounded border border-line px-1.5 py-1 text-xs text-ink-2"
        >
          <span
            className="w-4 h-4 rounded-full"
            style={{
              backgroundColor: custom.accent,
              ...(accent === 'custom' ? { boxShadow: `0 0 0 2px ${custom.accent}` } : {}),
            }}
          />
          Custom
        </button>
        <input
          type="color"
          aria-label="Pick custom accent colour"
          title="Pick custom accent colour"
          value={customColor}
          onChange={(event) => setCustomColor(event.currentTarget.value)}
          className="w-8 h-8 shrink-0 cursor-pointer rounded border border-line bg-surface p-0.5"
        />
        <output className="text-[11px] text-ink-3">{customColor.toUpperCase()}</output>
        <p className="w-full text-[11px] text-ink-3">
          Custom colours adapt for readability in each mode.
        </p>
      </div>
    </div>
  );
}

export function accentIdLabel(id: AccentSelection): string {
  if (id === 'custom') return 'Custom';
  return ACCENT_PRESETS.find((a) => a.id === id)?.label ?? id;
}
