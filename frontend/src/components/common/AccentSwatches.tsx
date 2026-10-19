import clsx from 'clsx';

import { useThemeStore } from '../../store/themeStore';
import { ACCENT_PRESETS, type AccentId } from '../../theme/accents';

/**
 * The accent-choosing row shared by the TopBar popover and the Settings
 * Appearance card. Swatches are buttons, not radios: like the theme menu they
 * change an immediate visual preference, and `aria-pressed` is the honest
 * state for a toggle-style control in a row.
 */
export default function AccentSwatches({ className }: { className?: string }) {
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);

  return (
    <div
      className={clsx('flex items-center gap-2 flex-wrap', className)}
      role="group"
      aria-label="Accent colour"
    >
      {ACCENT_PRESETS.map((preset) => {
        const active = accent === preset.id;
        return (
          <button
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
              background: `linear-gradient(135deg, ${preset.swatch}, ${preset.light.accent2})`,
              ...(active ? { boxShadow: `0 0 0 2px ${preset.swatch}` } : {}),
            }}
          />
        );
      })}
    </div>
  );
}

export function accentIdLabel(id: AccentId): string {
  return ACCENT_PRESETS.find((a) => a.id === id)?.label ?? id;
}
