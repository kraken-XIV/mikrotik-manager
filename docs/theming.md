# Theming

[← Documentation index](README.md)

MikroTik Manager ships light and dark colour schemes, follows the operating
system's scheme when asked, and offers six accent colours. Preferences are
per-browser: each signed-in user picks their own, nothing is stored on the
server, and the choice survives reloads.

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
- **Second chart series** stay a fixed violet so two lines never render in the
  same hue — the accent is one colour by definition.
- **Leaflet map pins** and the **terminal's ANSI palette** are canvas/SVG
  attribute colours where CSS custom properties do not resolve.
- Chart gridlines are structural greys, not themed surfaces.

### Known leftovers

Roughly sixty one-off classes still carry raw palette steps (mostly alpha
washes such as `bg-red-950/40` and deep accent-adjacent borders). They were
deliberately left for case-by-case follow-ups: each is a small design
decision about which token family it belongs to, not a mechanical rename.
The token-class guard test does not flag them — they are valid Tailwind
classes, just not token ones.
