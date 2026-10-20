# Post-v1.0 preparation: general test floor

Independent branch on upstream 5970401 (v0.75.0-beta), not dependent on lint or theming. Extracted reusable component tooling/tests from 668bd93 without its security/runtime/auth changes. Reconcile after the actual v1.0 release.

Scope: six non-auth component suites, DOM setup, coverage reporting/measurement and a raise-only ratchet. Backend application source remains byte-identical to upstream. Historical 0.73 backend/frontend thresholds are not transplanted.

The useCanWrite test/fix is deliberately deferred because the archive changes authorization behaviour. Tests for legacy login and other security fixes likewise remain out. No upstream PR authorized by this branch preparation.
