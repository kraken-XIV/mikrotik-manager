# Post-v1.0 preparation: lint and formatting

Independent branch on upstream 5970401 (v0.75.0-beta); not v1.0-ready or an upstream submission.
Tooling/configuration and mechanical formatting/import sorting are separate commits. Upstream behaviour and new release files are preserved. New a11y rules retain the archived documented rollout exclusions; existing security rules are unchanged.
Source: 1b8bc03, re-applied mechanically to current upstream instead of copying stale source. No theme, coverage policy, scanners, runtime hardening or legacy login.
Run root format:check, both package lint/types/tests/build and frontend lint:css. Reconcile all rules/exclusions with v1.0 before proposing.

Formatter compatibility exceptions (test-only): explicit leading reflect-metadata import in the PKI suite; retain the console-format detector while distinguishing a single-argument trailing comma from a real extra argument. Positive/negative scanner fixtures remain active. No product security behaviour is changed.

Formatting also relocates the existing GlobalSearch set-state-in-effect directive to the same setResults call after its one-line conditional expands. This preserves an upstream local exception; it does not introduce a global rule exclusion or change runtime logic.

## Unresolved dependency audit debt

This is an extraction, not a security-clean claim. npm audit on the current upstream frontend baseline reports 15 affected packages (10 high, 5 moderate). This lint branch reports 17 (12 high, 5 moderate): new dev-tool Stylelint and globby chains reach the existing braces GHSA-vfj7-8cjw-p6xm advisory. No additional advisory identities were found relative to baseline, but the additional chains are still unresolved. No advisories are ignored/dismissed and no old runtime patch/postinstall hook is smuggled into this branch. Reconcile/remediate through the separately authorized hardening work before claiming upstream submission readiness; do not apply npm audit fix --force or a breaking tool downgrade automatically.
