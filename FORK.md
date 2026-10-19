# Fork notice — mikrotik-manager

This repository is a fork of **[2GT-Media-Group-LLC/mikrotik-manager](https://github.com/2GT-Media-Group-LLC/mikrotik-manager)** — a self-hosted control plane for MikroTik fleets — licensed under the **GNU Affero General Public License v3.0** (`LICENSE`, kept verbatim).

## Provenance

- Upstream baseline: `v0.72.0-beta` (commit `19c6ea0`)
- Sync policy: `main` mirrors upstream (fast-forward only); `fork/main` (this branch, the default) = `main` + fork governance overlay, merged forward on every sync

## Modifications vs upstream

1. Fork governance overlay — `NOTICE`, this file, and the community files under `.github/`
2. Theming work on branch `feat/theme-system-and-accent` (light/dark/system preference, accent engine, design-token unification) — developed for upstream contribution
3. Fork infrastructure from the improvement program (linting, testing, security-scanning lanes) as it lands

## Upstream relationship

- Improvements intended for upstream are developed on `feat/*` branches and proposed **upstream first** (issue-first rule per upstream README)
- Fork-only work lives on `fork/*` branches or this default branch

## Security

Please report vulnerabilities **upstream** via private vulnerability reporting on the upstream repository. See `.github/SECURITY.md` for the full policy.
