# Theme controls (preparation branch)

Light, Dark and System follow the saved browser preference; System updates live.
Choose an accent preset or a custom colour from Login, the top bar or Settings → Appearance.
Swatches use the actual resolved tone. Custom base colours may be adjusted for readable contrast.
Preferences use the historical browser storage key, with validation and pre-render application.

This first slice adds the controls and affects existing token-based styling plus the login and appearance controls. Many existing views still have hardcoded palette classes; their migration, chart/STP accents and optional surface schemes are separate follow-ups. It does not claim whole-application accent coverage.

Run `npm test`, `npm run build`, `npm run e2e:check` and `npm run e2e` in frontend. Browser fixtures intercept API calls; no live router is used.
