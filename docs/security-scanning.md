# Security scanning

Four scanners run alongside CodeQL and the audit lane. Three of them block
merges, one only reports. This page is the response runbook: what each check
watches, what a red check means, and what to do about it. The baseline files
(`.gitleaks.toml`, `.trivyignore`) are ratchets — they only ever shrink.

| Check name               | Trigger                       | Watches                               | Behaviour |
| ------------------------ | ----------------------------- | ------------------------------------- | --------- |
| Secrets — gitleaks       | push, PR, weekly full history | every commit, for credential patterns | blocking  |
| Trivy — vuln & misconfig | push, PR, weekly              | lockfiles, Dockerfiles, compose files | blocking  |
| Dependency Review        | PRs                           | the PR's dependency diff              | blocking  |
| Scorecard analysis       | weekly, pushes to default     | repository supply-chain posture       | advisory  |

The weekly schedules pick odd minutes so the sweeps never collide with each
other or with CodeQL's Monday 08:00 run.

## The baseline ratchet

Both baseline files silence findings that cannot be fixed in the repository.
The policy for every entry:

- it names the exact file (gitleaks) or check ID (Trivy) and states why the
  match is not actionable;
- it carries the date it was last reviewed;
- it dies with the code it explains — delete the entry the moment the finding
  disappears. A baseline that only grows is a vulnerability backlog wearing a
  green badge.

If a finding can be fixed in the repository, fix it; do not baseline it.

## A gitleaks finding

1. Treat it as real until proven otherwise. The job log shows the file, line
   and rule for each match.
2. If the secret is live, **rotate or revoke it first**, then remove the code.
   The commit history already contains the value — deleting the file without
   rotation removes nothing an attacker doesn't have.
3. If the secret never left your machine (blocked by the pre-commit hook, or
   caught on the PR before merge), delete it and rewrite the commit
   (`git commit --amend`, or `git rebase -i` for older commits) before
   pushing.
4. Test fixtures and documentation placeholders: prefer making the value
   obviously synthetic (`e2e-key-a-0123456789abcdef0123456789` style) over
   adding an allowlist entry. When an allowlist entry is genuinely needed, it
   must name the file, state the reason, and be deleted together with the code
   it covers.

The optional pre-commit hook runs the same ruleset on the staged diff when
gitleaks is installed locally — it skips silently when it is not.

## A Trivy finding

- **Vulnerability (HIGH/CRITICAL with a fix available):** update the
  dependency in the affected `package-lock.json`. Dependabot's Monday PRs
  usually get there first; the scan catches whatever lands in between.
- **Misconfiguration:** fix the Dockerfile or compose file. The single
  standing baseline entry is DS-0002 for `nginx/Dockerfile`: the official
  nginx image starts its master process as root so it can bind :80/:443 and
  drop privileges afterwards, and the entrypoint generates the self-signed
  certificate. Forcing a `USER` would break both. Re-review that entry
  whenever the file changes.
- **Unfixed dev-only advisories:** intentionally out of this scan's scope
  (`--ignore-unfixed`). `npm audit` still reports them. The standing example
  is the braces advisory with no upstream fix —
  `backend/scripts/harden-braces.cjs` bounds its parser depth until a patched
  release exists; keep that guard, and remove it only with its regressions
  passing.

## A dependency review failure

The check fails when a PR's dependency diff **introduces** a HIGH+ advisory.
Fix by bumping the dependency the PR added — usually to whatever version the
advisory names. Dependencies that were already vulnerable before the PR do not
block it; they belong to the Security Audit lane (production) and the GitHub
alert view. Note the action moved from the `github` org to `actions`; the
workflow pins the new location and Dependabot keeps the pin current.

## Scorecard

[OpenSSF Scorecard](https://scorecard.dev) scores supply-chain posture weekly
and publishes the result publicly. It is advisory on purpose: the trend and
the published entry are the signal, not a merge gate. The repo already
satisfies the heavyweight checks — pinned action SHAs, CodeQL, SBOM +
provenance + cosign signatures on the published images, branch protection,
Dependabot, SECURITY.md.

## Running the scanners locally

```bash
# staged-diff secret scan — what the optional pre-commit hook runs
gitleaks protect --staged --redact

# full-history secret scan — what the weekly CI sweep runs
gitleaks detect --source .

# the Trivy gate, exactly as CI runs it
trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL \
  --ignore-unfixed --skip-dirs '**/node_modules/**' --exit-code 1 .
```

## Scope note: container image scanning

The published images are not scanned here. `publish.yml` builds and pushes in
one step, so an image gate would mean restructuring that workflow — an
upstream conversation, not a fork decision. In the meantime the misconfig scan
covers both Dockerfiles and the compose files, and every base image is pinned
by digest with Dependabot keeping the digests current.
