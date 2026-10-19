# Fork Governance — mikrotik-manager

Status: adopted at program start (Phase 0). Changes to this document are fork-only commits on `fork/main`.

## Mission

A disciplined fork of [2GT-Media-Group-LLC/mikrotik-manager](https://github.com/2GT-Media-Group-LLC/mikrotik-manager) that:

1. **Contributes upstream first** — improvements valuable to everyone are proposed to upstream (respecting its issue-first rule for major changes), not silently accumulated.
2. **Keeps a pristine mirror** — `main` always equals `upstream/main`, making upstream PRs, bisection, and conflict management cheap.
3. **Carries fork-only work visibly** — governance, tooling, and experiments live on the default branch or `fork/*` branches, never polluting the mirror.

## Decisions log

| Decision          | Choice                                              | Rationale                                                                                                                                   |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rebranding        | **None**                                            | Upstream identity, name, logo and README stay intact; keeps upstream contribution friction near zero and AGPL attribution trivially correct |
| Default branch    | `fork/main` (= `main` + governance overlay)         | Governance/community files are active (CODEOWNERS, templates, SECURITY.md) without diverging the mirror                                     |
| Sync cadence      | Weekly, or before starting any new work             | The Phase 4C token codemod touched 115 frontend files — the main conflict zone; small frequent merges beat rare painful ones                |
| Contribution flow | Upstream **issue-first** for major changes, then PR | Required by upstream README; the theming issue draft is already written (Phase 4 kit, HANDOFF.md §2)                                        |

## Branch model

| Branch           | Content                                                                                          | Rules                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `main`           | Exact mirror of `upstream/main`                                                                  | Never commit directly. Only `scripts/sync-fork.sh` (ff-only). Never diverges.                                    |
| `fork/main`      | `main` + governance overlay (NOTICE, FORK.md, `.github/` community files, optional fork tooling) | Default branch of the fork. Only ever **merges forward** (`git merge main`). Merge commits expected and allowed. |
| `feat/*`         | Work intended for upstream PRs                                                                   | Cut from `main`. PRs go to **upstream**, not to the fork. Rebase onto `main` after each sync.                    |
| `fork/*` (other) | Fork-only experiments                                                                            | May diverge freely; never propose to upstream.                                                                   |

### Phase 0 setup — 2026-10-19

- `main` mirrors current `upstream/main` (`482890d` at setup, v0.73.0).
- `fork/main` preserves original governance commits `e60f3b3` and `8c84d67`, merges current upstream, and carries fork-only tooling and CI triggers.
- `feat/theme-system-and-accent` is not present in this kit and has not been published. Later phases remain pending.
- CI and CodeQL run for both `main` and `fork/main`; CI also supports manual dispatch.
- Branch protection JSON is stored at the repository root; the helper resolves that path.

### Phase 3 — security scanning floor — 2026-10-19

- `fork/phase3-scoped-security` adds four scanners alongside CodeQL and the audit lane: gitleaks (secrets, weekly full-history sweep), Trivy (HIGH/CRITICAL fixed vulnerabilities in the lockfiles, Dockerfile misconfigurations (Compose semantics are not covered by Trivy)), dependency-review (PR diff gate) and OpenSSF Scorecard (advisory, published). Response runbook: `docs/security-scanning.md`.
- Baselines are ratchets, not blanket silence: the `.gitleaks.toml` allowlist entries and the single path-scoped `.trivyignore.yaml` entry each carry a written justification and must be deleted together with the code they explain.
- The dependency-review action moved from the `github` org to `actions` (the old path 404s); the workflow pins the new location.
- `protection-integration.json` proposes (activate only after reviewed merge) "Secrets — gitleaks", "Trivy — vuln & misconfig" and "Dependency Review" on `fork/main` (ten contexts in total). Scorecard is deliberately not required.
- Image scanning before the GHCR push is intentionally deferred: `publish.yml` builds and pushes in one step, and restructuring it is an upstream conversation.
- Conflict-zone addition: if upstream later ships its own security workflows, prefer upstream's versions upstream-side and drop the fork copies during sync, keeping only fork-specific deltas.

## Sync policy

```bash
bash scripts/sync-fork.sh   # ff main → merge-forward fork/main → push both
```

**Divergence recovery**

- `main` diverged (accidental commit/merge): if the commits belong on a branch, move them (`git branch <name>`), then `git checkout main && git reset --hard upstream/main`. Losing `main`'s local commits is acceptable — they should never exist.
- `fork/main` conflicts on merge-forward: upstream added files at overlay paths (NOTICE, FORK.md, `.github/*`). Resolve preferring upstream's product content while keeping the overlay files; the overlay set is small and well-known.

## Conflict zones (documented, expected)

1. **`frontend/src/index.css` + broad TSX** — the theming token codemod (Phase 4C) rewrote palette classes across 115 files. Sync early, sync often; the codemod is isolated in a single purely-mechanical commit (`d22bd6d`, +4,065/−4,065, zero logic) so conflicts bisect cleanly.
2. **`.github/`** — if upstream later adds its own CODEOWNERS/templates/SECURITY.md, prefer upstream's versions upstream-side and re-apply only fork-specific deltas on `fork/main`.

## Branch protection policy

- `main`: no force-push, no deletion, **linear history** (enforced by ff-only sync), no required reviews.
- `fork/main`: no force-push, no deletion, required CI checks (upstream `ci.yml` job names), **linear history off** (sync merge commits), no required reviews — a solo maintainer cannot approve their own PR; review requirements would deadlock the fork.
- `enforce_admins: false` on both: the solo maintainer retains emergency-push ability; the audit trail (`git reflog`, Actions history) compensates.

## Security

Vulnerabilities follow `.github/SECURITY.md`: upstream behaviour → upstream private reporting; fork-introduced → private reporting on the fork. The fork does not carry independent security patches; fixes arrive via sync.

## License

AGPL-3.0, verbatim (`LICENSE`). See `AGPL-COMPLIANCE.md` for the obligations checklist. Fork-only tooling and docs are likewise AGPL-3.0 to keep licensing uniform.
