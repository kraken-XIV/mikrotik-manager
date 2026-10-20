# Post-v1.0 preparation: lint and formatting

Independent branch on upstream 5970401 (v0.75.0-beta); not v1.0-ready or an upstream submission.
Tooling/configuration and mechanical formatting/import sorting are separate commits. Upstream behaviour and new release files are preserved. New a11y rules retain the archived documented rollout exclusions; existing security rules are unchanged.
Source: 1b8bc03, re-applied mechanically to current upstream instead of copying stale source. No theme, coverage policy, scanners, runtime hardening or legacy login.
Run root format:check, both package lint/types/tests/build and frontend lint:css. Reconcile all rules/exclusions with v1.0 before proposing.
