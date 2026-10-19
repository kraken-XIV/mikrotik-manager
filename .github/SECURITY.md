# Security Policy (fork)

This is a fork of [2GT-Media-Group-LLC/mikrotik-manager](https://github.com/2GT-Media-Group-LLC/mikrotik-manager).

## Reporting a vulnerability

Do **not** open a public issue.

- Vulnerabilities in **upstream behaviour** → report upstream via private vulnerability reporting: `Security → Report a vulnerability` on the upstream repository.
- Vulnerabilities introduced by **fork-only changes** → open a private vulnerability report on this repository (same path).

## Scope notes

- This fork tracks upstream closely; fixes usually land upstream first and arrive here via `scripts/sync-fork.sh`.
- Supported branch: `fork/main` (default). `main` is a pure upstream mirror and is not deployed from.
- Deployment hardening guidance from upstream docs applies unchanged (read-only rootfs, cap-drop, internal DB network).
