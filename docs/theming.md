# Theming

[← Documentation index](README.md)

MikroTik Manager ships light and dark colour schemes, follows the operating
system's scheme when asked, and offers six accent colours. Preferences are
per-browser profile, not per account: nothing is stored on the server, and the
choice survives reloads. Users sharing a browser profile share these visual
preferences.

## Choosing a theme

The sun/moon/monitor button in the top bar (top right on the login page) opens
theme and accent together:

- **Light** — the default.
- **Dark** — always dark, regardless of the OS.
- **System** — follows the operating system's `prefers-color-scheme` and
  switches live: flipping the OS setting repaints the app without a reload.

The same three choices are on **Settings → General → Appearance**, alongside
the accent swatches.

## Accent colours

Six accents are built in: **Blue** (the default), Violet, Emerald, Rose, Amber
and Teal. The accent drives the platform's interactive chrome: primary buttons,
focus rings, the sidebar's active item, links, the user chip, the STP root edge
in the topology, and the first series of the traffic, device and wireless
charts.

Blue is special: it is the palette the platform has always had, so choosing it
(the default) applies no override at all. Every other accent is written as
four CSS custom properties on `<html>` — `--accent`, `--accent-2`,
`--accent-soft` and `--accent-fg` — one set per colour scheme, applied by the
theme store at the same moment the scheme itself is applied. There is therefore
no flash of the old accent while the page loads.

## Contrast and surface schemes

Alongside the accent, **Settings → General → Appearance** offers three surface
schemes, stored with the rest of the theme preferences:

- **Default** — the standard palette; no attribute is written at all.
- **High contrast** — stronger ink and border tokens in _both_ colour schemes,
  for low-vision and bright-environment readability.
- **Midnight** — deepens dark mode's surfaces further. It is a dark-mode
  scheme by definition: the attribute is a no-op until dark is active, and
  applies automatically whenever it is (including under _System_).

Schemes are orthogonal to accents: schemes change the neutrals, the accent
changes the brand colour, and any combination is valid. Mechanically a scheme
is a single `data-scheme` attribute on `<html>`, and each scheme is one token
override block in `frontend/src/index.css` — components never learn a scheme
exists.

## How the themes work

Both schemes and all accents are built from the design tokens in
`frontend/src/index.css`: semantic CSS custom properties (`--surface`,
`--ink-2`, `--line`, `--bad`, …) that the `.dark` class and the accent engine
re-point. Components reference tokens — `bg-surface`, `text-ink-2`,
`border-line` — rather than raw Tailwind palette steps, which is what makes a
scheme switch a two-class toggle rather than a rewrite.

Per-accent values live in `frontend/src/theme/accents.ts`. Adding an accent is
a matter of appending one object there (four variables × two schemes); the
pickers, persistence and validation pick it up automatically.

### Deliberate exceptions

A few surfaces keep fixed colours on purpose:

- **Login and change-password pages** have their own backgrounds and
  translucent cards over the circuit animation; the accent still applies to
  the logo and the SSO button.
- **Secondary chart series** retain their distinct existing colours so two lines never render in the
  same hue — the accent is one colour by definition.
- **Leaflet map pins** and the **terminal's ANSI palette** retain their own
  fixed palettes; these renderer integrations do not follow the HTML token
  cascade.
- Chart gridlines are structural greys, not themed surfaces.

### Known leftovers

Roughly sixty one-off classes still carry raw palette steps (mostly alpha
washes such as `bg-red-950/40` and deep accent-adjacent borders). They were
deliberately left for case-by-case follow-ups: each is a small design
decision about which token family it belongs to, not a mechanical rename.
The token-class guard test does not flag them — they are valid Tailwind
classes, just not token ones.

## Validation and compatibility

- Historical light/dark payloads retain their preference; absent accent/scheme
  fields default to Blue/Default. Both startup and store rehydration select only
  whitelisted preferences, so malformed storage cannot replace action methods.
- System tracking starts at boot, including authenticated deep links that never
  mount the login page. Midnight follows the resolved mode, not a saved guess.
- The shared picker is a non-modal dialog with native Tab navigation, initial
  focus on the selected mode, Escape-to-trigger focus, and focus-out dismissal.
- Accent button text meets a 4.5:1 contrast minimum in both modes and hover
  states. High-contrast muted ink also meets 4.5:1 on the deepest card surface.
  This is a tested token guarantee, not a claim that every legacy UI is WCAG-certified.
- Recharts passes explicit colours to child paths and legends. Primary series
  use token-valued SVG props so the rendered curve and legend, not just their
  wrapper, follow the chosen accent.
- The required frontend CI lane runs unit coverage, browser-test type checking
  and the Chromium theme suite. Run `npm run e2e` from `frontend/` locally after
  `npx playwright install chromium`.
- The token-class guard reads source as text from disk. Importing all sources as
  Vite `?raw` modules can corrupt coverage maps for those paths; that approach
  is intentionally not used. Existing coverage floors are unchanged.

No admin white-label features or rebranding are included in this phase.

## Custom accent colour picker

Use the colour input beside **Custom** in Settings → Appearance or the shared
Login/top-bar theme picker. The browser's built-in colour chooser accepts any
opaque RGB colour; no extra account or dependency is needed. Choosing a colour
activates it immediately and saves it in this browser profile. **Custom** restores
your last colour after trying a preset; the six existing presets are unchanged.

The chosen base colour generates readable Light and Dark tones (including
normal/hover button labels and accent links). System uses the resolved OS mode
and updates live. The Custom bubble always displays the actual applied tone;
the colour input and hex readout show the chosen base colour. A very bright or
dark base may therefore render differently to keep text readable. Surface schemes
remain independent. Only validated six-digit hex values enter persistence/CSS;
legacy preferences and malformed storage safely fall back to existing defaults.
