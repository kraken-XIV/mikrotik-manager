# Separated post-v1.0 contribution preparation

**Preparation only. No upstream PRs, fork PRs, merges, production deployment or automatic submission.**

Prepared at Remco’s request on 2026-10-21. Upstream is currently v0.75.0-beta, not v1.0.0. All independent roots use `59704017a82987b655c08936164b4d754b4bc6d1`. These are reusable extraction branches, not a claim that they apply to an unreleased v1.0. Wait for the actual release, inspect the then-current code, reconcile/revalidate, and obtain the separate submission direction. The maintainer discussion is [issue #329](https://github.com/2GT-Media-Group-LLC/mikrotik-manager/issues/329).

## Branch map

| Workstream | Branch | Parent for review | Scope |
|---|---|---|---|
| 1 | [prepare/v1-theme-core](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-core) | `upstream/main` | Core themes, presets/custom picker, matching swatches and focused tests (26 paths) |
| Follow-up | [prepare/v1-theme-surfaces](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-surfaces) | `prepare/v1-theme-core` | High-contrast and midnight surfaces (6 paths) |
| Follow-up | [prepare/v1-theme-tokens-shared](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-tokens-shared) | `prepare/v1-theme-core` | Shared components and settings/layout token migration (60 paths) |
| Follow-up | [prepare/v1-theme-tokens-devices](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-tokens-devices) | `prepare/v1-theme-core` | Device-detail token migration (26 paths) |
| Follow-up | [prepare/v1-theme-tokens-pages](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-tokens-pages) | `prepare/v1-theme-core` | Page token migration (32 paths) |
| Follow-up | [prepare/v1-theme-charts-topology](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-theme-charts-topology) | `prepare/v1-theme-core` | Primary chart series and STP root accent (11 paths) |
| 2 | [prepare/v1-lint-format](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-lint-format) | `upstream/main` | Independent lint tooling, mechanical formatting/import sorting and compatibility fixes (678 paths) |
| 3 | [prepare/v1-test-floor](https://github.com/kraken-XIV/mikrotik-manager/tree/prepare/v1-test-floor) | `upstream/main` | Independent reusable DOM suites and freshly measured coverage floor (17 paths) |

The five follow-ups are siblings on theme core, NOT a prerequisite stack underneath it. Lint and test-floor branches are wholly independent of themes and each other. Review follow-ups against their named core parent, not against upstream (which would also show the core). Once core is accepted, reconcile follow-ups onto the new upstream main individually; do not merge the entire preparation set as an omnibus contribution.

Scope details live in each branch’s `docs/theme-*.md` or `docs/contribution-preparation.md`. The inherited core document in follow-up branches describes the core slice; the follow-up-specific document describes the additional changes.

## Local verification

| Slice | Fresh validation on this v0.75 baseline |
|---|---|
| Theme core | 338 unit tests; 15 Chromium regressions; lint/types/build/browser-types passed |
| Surfaces | 342 unit tests; 17 Chromium regressions; lint/types/build/browser-types passed |
| Each of 3 token migrations | 338 unit tests; lint/types/build/browser-types passed; AST proof for 115 migrated TSX files shows zero non-colour logic changes |
| Charts/topology | 338 unit tests; 16 Chromium regressions including a real rendered chart; lint/types/build/browser-types passed |
| Combined themes (local validation only) | 342 unit tests; 18 Chromium regressions; lint/types/build passed |
| Lint/format | 304 frontend tests; 1,761 backend tests with PostgreSQL; package lint/types/build, root format and CSS checks passed; semantic AST proof over 621 TS/TSX files with two declared test-only compatibility exceptions |
| General test floor | 339 frontend tests with coverage; 1,761 backend tests with PostgreSQL and coverage; package lint/types/build and coverage-ratchet check passed |
| Real staged hook | Commit under a path with spaces and quoted filenames proved Prettier and both package import-sort linters execute; invalid staged code was rejected |

GitHub CI is **not claimed**: no PRs were opened and no manual CI dispatch was requested. The existing upstream/default-branch CI workflows are not silently disabled or bypassed. New theme-only browser steps and test-only coverage steps are included in the corresponding branches for future PR review. Existing warnings remain visible, not suppressed to make the split look clean.

Initial standalone general-test baseline without PostgreSQL: frontend statements/branches/functions/lines 11.29/7.47/5.58/10.97%, new integer floors 11/7/5/10; backend 39.24/37.12/35.82/40.10%, new floors 39/37/35/40. Upstream at this base has no thresholds, so no existing floor was reduced. PostgreSQL-enabled gates also pass. Re-measure for v1.0; do not carry historical 0.73 thresholds forward blindly or lower an upstream floor.

The mechanical lint pass retains application behaviour. Its only test-logic adaptations are an explicit leading reflect-metadata polyfill and fixing the console-format test detector to distinguish a single-argument trailing comma from a real extra argument (with positive/negative regressions). A pre-existing GlobalSearch local lint directive is relocated to the same statement after formatting expands a one-line conditional; no new global exclusion is added.

The local combined validation found an overlapping append to index.css between surfaces and charts. Both intended CSS blocks were retained. Other follow-up code merged automatically. The combined validation branch is deliberately **not published**; it is evidence only, not a new omnibus contribution.

## Preserved boundaries and deferred work

- Default `fork/main` remains `f695a915d1494624f2ccaa072c5b0571de04effe`; mirror `main` remains `482890d0bb42bdf571d27bdb5ed06e7ac29aec52`. The historical combined contribution remains `bbe276f7dac6c5784fb91e4c90df42e3f94b044c`.
- No branch/default/protection/ownership settings changed. No LICENSE/AGPL edits or fork-administration files added to these feature branches. Existing local preview, account, password, database and device configurations remain untouched.
- Theme core has no backend, Docker, broad palette migration, coverage floor, scanner or legacy-login changes. It intentionally does not claim whole-app accent coverage before the follow-ups land.
- Latest upstream behaviour was preserved; new v0.74/v0.75 views absent from the historical palette migration remain outside those replayed mappings and must be included in the future gap assessment.
- The permission-hook fix/test, backend security hardening/tests, dependency patches and Docker hardening remain archived, not inserted into the general test floor. None is silently treated as part of a theme/lint contribution.
- Supply-chain scanning and publishing trust are NOT separated or implemented here (workstream 4 is deferred).
- Legacy MD5 login is excluded. Any future proposal requires its own discussion: explicit per-device opt-in, accepted warning, never default/fallback, identity-verified TLS and isolation enforced server-side.
- npm audit debt on this pre-v1.0 baseline is not a security-clean verdict. No advisory was dismissed and no audit control was relaxed by this split. Dependency remediation belongs to separately authorized hardening, not a hidden addition to these preparation branches.

## Audit comparison (frontend lockfiles, all dependencies)

These are npm-reported affected-package counts, not unique vulnerability counts. Upstream baseline and theme: 15 (10 high, 5 moderate); general test floor: 13 (10 high, 3 moderate); lint: 17 (12 high, 5 moderate). No slice adds an advisory identity relative to the current upstream baseline. Lint adds Stylelint/globby dev-tool chains reaching the existing braces GHSA-vfj7-8cjw-p6xm finding; those chains remain unresolved and are explicitly documented in the lint branch. Backend/full security posture is not certified by this comparison. No findings were suppressed. This is a preparation result, not approval to submit with audit debt.

## Stop / resume

The requested items 1, theme follow-ups, 2 and 3 are separated and stored. STOP here. Do not proceed to scanners, other hardening, legacy login, upstream comments/PRs or automatic release monitoring. Resume only on Remco’s next direction. After v1.0, focus first on the standalone theme core and negotiate the smaller follow-up scopes with the maintainer.
