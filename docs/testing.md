# General component-test floor

Independent pre-v1.0 preparation based on 5970401. Adds reusable DOM test setup, six existing component suites, coverage reporting and a raise-only frontend ratchet command. Theme-specific tests belong with theming, not this branch.

Node remains the default environment; DOM suites opt into jsdom. Native Node storage is disabled in Vitest workers. Shared setup provides RTL cleanup and a scrolling shim only where DOM exists.

Frontend: npm test; npm run test:coverage; npm run coverage:ratchet. Backend: npm run test:coverage. Backend PG-backed checks require an isolated PG_E2E_URL and remain mandatory in CI.

Coverage floors are measured on this independent current-upstream slice, not copied from the old combined branch. Re-measure and review upward ratchets when porting to v1.0; never lower upstream controls to make the branch pass.

Excluded: theme tests/features, permission-hook behaviour fix and its regression, authentication/legacy login tests or code, error/email/certificate security fixes, dependency patches, Docker, scanner and lint policy. Those excluded hardening changes remain archived for separate work.

Measured initial no-PG baseline: frontend 11.29% statements, 7.47% branches, 5.58% functions, 10.97% lines (new floors 11/7/5/10); backend 39.24/37.12/35.82/40.10% (new floors 39/37/35/40). Upstream at this base has no coverage thresholds. These are not reductions of existing controls. PG-enabled validation is recorded separately.
