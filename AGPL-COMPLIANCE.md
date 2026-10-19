# AGPL-3.0 Compliance Checklist — mikrotik-manager fork

The fork is licensed, without modification, under the **GNU Affero General Public License v3.0**. Upstream `LICENSE` is kept byte-identical. This document maps each obligation to how this fork satisfies it, and gives verification commands.

## Obligations → how this fork satisfies them

| # | AGPLv3 requirement | How this fork complies |
|---|---|---|
| 1 | Keep license & copyright notices intact (§4–5) | `LICENSE` untouched (AGPLv3 verbatim); `NOTICE` added crediting 2GT Media Group LLC and contributors; upstream README identity preserved (**no rebranding** — recorded decision) |
| 2 | State significant modifications (§5a) | `NOTICE` + `FORK.md` on the default branch list the modification classes; the git history records every individual change; GitHub's "forked from" banner adds provenance |
| 3 | Corresponding source for binaries you distribute (§6) | No binaries distributed. Docker images, if ever published, must be built from this public repo (CI-built, SBOM + provenance as upstream does) |
| 4 | **Network users get source (§13)** — the AGPL's defining clause | If you run the fork as a network service, every user is entitled to the Corresponding Source. For a modified network service, prominently offer every remote user access to its exact Corresponding Source at no charge through a standard means. A public repository can host that source, but merely publishing a repository is not the complete offer mechanism. Record the deployed commit SHA and include required build/install source and scripts |
| 5 | Same license downstream (§10) | Nothing in the fork relicenses or restricts; fork-only tooling/docs are AGPL-3.0 too, keeping the tree uniform |
| 6 | No additional terms/suedo-warranties added | None added |

## Verification commands

```bash
# LICENSE is AGPLv3 verbatim on the default branch
curl -s https://raw.githubusercontent.com/<you>/mikrotik-manager/fork/main/LICENSE | head -2
#   → "GNU AFFERO GENERAL PUBLIC LICENSE / Version 3, 19 November 2007"

# Modification notice present
gh api repos/<you>/mikrotik-manager/contents/NOTICE?ref=fork/main --jq .name

# Repo visibility (public hosting is the chosen fork policy, not a universal AGPL requirement)
gh repo view <you>/mikrotik-manager --json visibility
```

## Practical rules going forward

1. **Keep the fork public** as long as you (or anyone) run it as a network service. If you must make it private, you need a §13 source-offer mechanism for your service's users before flipping visibility.
2. **Deploy only committed SHAs.** Hot-patching a deployment creates uncommitted "Corresponding Source" debt.
3. **Attribution stays** in the login page footer, docs, and README — upstream preserved all of these; the theming PR was specifically implemented so default rendering is byte-identical, including attribution surfaces.
4. **Upstream contributions** remain AGPL-3.0 automatically (they inherit the upstream license).
