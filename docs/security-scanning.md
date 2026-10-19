# Security scanning and CI policy

Phase 3 adds mandatory-on-run Gitleaks, Trivy and dependency-diff gates alongside
CodeQL, runtime npm audits, coverage, lint and build checks. No security job uses
`continue-on-error`. Scanner/configuration/download failures fail CI too.

| Check                         | Scope                                                                           | Policy                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Secrets — gitleaks            | Full reachable Git history on PR/push/manual/weekly runs                        | Any unexcepted secret fails                                                  |
| Trivy — vuln & misconfig      | All three npm lockfiles, including dev dependencies; repository Dockerfiles/IaC | Fixed HIGH/CRITICAL vulnerabilities and HIGH/CRITICAL misconfigurations fail |
| Dependency Review             | New runtime, development and unknown-scope PR dependencies                      | HIGH/CRITICAL advisories fail; no advisory allowlist                         |
| Security Audit                | Backend/frontend production npm dependencies                                    | HIGH/CRITICAL advisories fail; no advisory allowlist                         |
| Scorecard preview (read-only) | PR posture preview                                                              | Advisory posture; execution errors fail, no publishing/write token           |
| Scorecard analysis            | Trusted default-branch push, branch-protection events, weekly                   | Advisory posture published to OpenSSF and code scanning                      |

The Trivy job separately prints HIGH/CRITICAL advisories **including unfixed**
ones. This informational report does not claim that unpatched dependencies are
remediated. Its scanner errors still fail the job. The actionable gate uses
`--ignore-unfixed`; adding a fixed advisory to either runtime or development
lockfiles fails that gate. Keep both steps and dependency review enabled.

## Reproducible tools and workflow trust

`scripts/install-security-tools.sh` downloads Gitleaks **8.30.1** and Trivy
**0.76.0**, Linux x86_64 upstream release archives, and verifies hardcoded SHA256
checksums **before** extracting or executing them. Values were checked against
the release assets' GitHub digests and release checksum files on 2026-10-19.
Bazzite can also use `brew install gitleaks trivy` (these same versions reviewed).
Vulnerability/check databases refresh normally; they are security feeds, not
frozen baselines. No commercial action licence, additional account or paid
service is required for the Gitleaks CLI.

All workflow action references are full verified upstream commit SHAs. For
Scorecard v2.5.0 the signed annotated tag object `46dc3187…` was peeled to its
commit `fa7117db83c52d787ae5a89f350999701505d78e`; an annotated-tag object is not
used as an executable commit pin. Update pinned binaries/checksums together,
review release provenance and rerun exception regressions when upgrading.

PR jobs have read-only tokens; checkouts in new workflows do not persist Git
credentials. Documentation build is now read-only too. Only the separate trusted
Scorecard publication job receives `security-events: write` and `id-token: write`.
It runs no repository scripts and uses only Scorecard-approved actions. Existing
CodeQL upload, release, documentation deployment and image signing retain their
necessary **job-level** grants, not workflow-wide write defaults. Nothing in the
Phase 3 PR runs a production deployment. PRs do not run publishing jobs.

## Exact Gitleaks false-positive exceptions

`.gitleaks.toml` extends all default rules. Each supported `targetRules` entry
requires **AND** matching an anchored exact file path and anchored exact captured
secret. No directory is excluded and no rule is globally disabled.

| Exact file                                                           | Rule               | Exact permitted synthetic value(s)                                             | Justification / removal                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/services/platformBackup/__tests__/roundtrip.pg.test.ts` | `generic-api-key`  | `e2e-key-a-0123456789abcdef0123456789`, `e2e-key-b-fedcba9876543210fedcba9876` | Reviewed disposable PostgreSQL round-trip fixture constants, not issued credentials. Remove the corresponding pattern when a fixture is removed/replaced. |
| `docs/api.md`                                                        | `curl-auth-header` | `mtm_your_token_here`                                                          | Literal bearer placeholder, never an issued token. Remove when the example changes/disappears.                                                            |

The unexcepted full-history scan found exactly these three findings on
2026-10-19. No actual credential was accepted as a false positive. New values in
the same file, the same value elsewhere, prefixed/suffixed lookalike paths and
other secret rules still fail. Do not broaden a pattern to get a green scan.

For a genuine credential finding: revoke/rotate with its owner, remove exposure,
then coordinate any necessary history cleanup. Redaction is log protection, not
credential revocation; do not commit a baseline that conceals a live secret.

## Exact Trivy exception: nginx only, not a CVE

The old global `.trivyignore` is removed. `.trivyignore.yaml` contains exactly
one **misconfiguration** exception (no vulnerability/CVE or package exceptions):

- ID **DS-0002**, exact path **`nginx/Dockerfile`**, expiry **2027-01-19**.
- Reviewed 2026-10-19: this official nginx image's master starts as root to bind
  ports 80/443, and its entrypoint generates certificate files. Workers use the
  nginx account. This does not make a root master risk-free.
- Remove when startup supports pre-provisioned certificates and a verified
  non-root/unprivileged image, or when this component is removed. Re-review
  before expiry; expiration intentionally makes CI fail until resolved.
- This exception cannot apply to a backend Dockerfile, another image path, a CVE,
  or another misconfiguration in the nginx Dockerfile. A genuine nginx image CVE
  remains detectable if an image scan is run; this phase's gate scans source
  lockfiles/IaC, not built image contents.

`node_modules` trees alone are skipped by the repository scan: vendored package
build Dockerfiles are not our deployed components. All three source lockfiles
remain scanned. Do not add blanket source directories or rule exclusions.

## Run scans and regression tests

From the repository root, with Python 3 and the reviewed scanners on PATH:

```bash
bash scripts/install-security-tools.sh all /tmp/mtm-security-bin
export PATH="/tmp/mtm-security-bin:$PATH"
python3 scripts/test-security-exceptions.py
gitleaks git --redact --no-banner --config .gitleaks.toml .
trivy fs --scanners vuln,misconfig --include-dev-deps --severity HIGH,CRITICAL \
  --ignore-unfixed --skip-dirs '**/node_modules/**' \
  --ignorefile .trivyignore.yaml --exit-code 1 --no-progress .
# Informational unpatched-debt report, not a green remediation claim:
trivy fs --scanners vuln --include-dev-deps --severity HIGH,CRITICAL \
  --skip-dirs '**/node_modules/**' --ignorefile .trivyignore.yaml --no-progress .
```

The 14 regression tests run the **actual** scanners in temporary directories,
first without exceptions to prove each fixture triggers, then with the production
configuration to prove only the reviewed findings disappear. Trivy's negative
fixtures exercise backend/root regressions, lookalike paths and another HIGH
finding in the same nginx file. A vulnerable-package fixture proves that the
same HIGH advisory remains visible in both nginx and backend lockfile paths. Gitleaks tests cover exact-value/file/rule
boundaries. Nonzero genuine-finding exits are asserted, not ignored. Synthetic
findings are generated at runtime, never staged in the repository. The optional
Husky guard scans the staged diff if Gitleaks is installed; mandatory CI does not
skip when tools are missing.

## Remaining risks and rollout boundaries

- **GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 / braces 3.0.3** has no published fixed release at review.
  Full npm audits still report inherited development-only chains (frontend 7,
  backend 3 high chains for this single advisory). The existing install-time
  depth guard and regression self-tests remain unchanged. `--ignore-scripts`
  bypasses that guard; run the package postinstall explicitly if using it.
  Replace/remove the mitigation when a verified fixed dependency is available.
  No advisory ID has been added to a scanner/audit exception for this debt.
- Trivy reports the two repository Dockerfiles; it does not analyze Docker
  Compose semantics in this version. The separate generated-Compose consistency
  check is not a vulnerability scan. No built-image or Compose-security coverage
  is claimed.
- The immutable Scorecard wrapper commit currently invokes the upstream
  `ghcr.io/ossf/scorecard-action:v2.5.0` container tag internally. That upstream
  tag is not digest-pinned by its action metadata; a commit pin alone does not
  freeze this transitive image. This inherited supply-chain limitation remains
  for the advisory scanner, not for the checksum-pinned blocking CLIs.
- HIGH/CRITICAL is the gate threshold; lower-severity advisories still need normal
  maintenance. A passing scan is not proof that unknown vulnerabilities do not
  exist. Container-image CVE scanning before registry push remains a separate
  publisher redesign; this phase neither deploys nor pushes images.
- Scorecard is posture, not an application-security test. PR preview does not
  publish; scheduled/default-branch publishing can only be proved after this PR
  is reviewed and merged. No automatic merge is authorized.
- `protection-integration.json` proposes the existing seven contexts plus the
  three new gates (ten total). Live branch protection stays unchanged during
  review. After observing successful PR checks and an authorized merge, apply
  the merged configuration deliberately; do not activate contexts before they
  exist on the protected branch. Scorecard remains advisory.
- GitHub secret scanning and push protection were verified enabled for this
  public fork. No credentials, live RouterOS configuration, TLS login behavior,
  firewall rules or product code are changed by Phase 3.
