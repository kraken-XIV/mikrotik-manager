# Contribution preparation

Prepared against **v0.75.0-beta (`5970401`)**. Reconcile and revalidate after v1.0.0; no upstream PRs are open for these branches.

| Scope | Branch |
|---|---|
| Theming core | [prepare/v1-theme-core](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-core) |
| Surface schemes | [prepare/v1-theme-surfaces](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-surfaces) |
| Shared UI tokens | [prepare/v1-theme-tokens-shared](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-tokens-shared) |
| Device tokens | [prepare/v1-theme-tokens-devices](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-tokens-devices) |
| Page tokens | [prepare/v1-theme-tokens-pages](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-tokens-pages) |
| Charts and topology accents | [prepare/v1-theme-charts-topology](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-charts-topology) |
| Lint and formatting | [prepare/v1-lint-format](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-lint-format) |
| General test floor | [prepare/v1-test-floor](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-test-floor) |

The five theme follow-ups build on theme core. Lint/formatting and the general test floor are independent.

**Local validation:** combined themes passed 342 unit tests and 18 Chromium checks. The lint and test-floor branches each passed 1,761 PostgreSQL-enabled backend tests. Relevant lint, types and builds passed; GitHub CI is not claimed.

**Known debt:** inherited dependency advisories remain; Stylelint adds dev-tool chains to an existing advisory. See [audit comparison](docs/preparation/audit-comparison.json). Exact branch heads and scopes are in the [manifest](docs/preparation/manifest.json).

**On hold:** scanners, runtime hardening and legacy login. No further work or upstream submissions without explicit approval.
