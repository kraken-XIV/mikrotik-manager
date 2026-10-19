#!/usr/bin/env bash
# =============================================================================
# Phase 0 — branch protection for the fork
#
#   Usage: bash scripts/apply-branch-protection.sh <main|fork/main>
#
#   main       -> protection-mirror.json      (no required checks, linear history)
#   fork/main  -> protection-integration.json (required checks, merges allowed)
#
# Requires: gh authenticated with admin access on the fork.
# Re-runnable: applies current JSON over any previous rules.
# =============================================================================
set -euo pipefail
BRANCH="${1:?Usage: apply-branch-protection.sh <main|fork/main>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

command -v gh >/dev/null 2>&1 || { echo "gh CLI not found" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated — run: gh auth login" >&2; exit 1; }

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
[[ -n "$ORIGIN_URL" ]] || { echo "Run from inside the clone (needs the 'origin' remote)." >&2; exit 1; }
SLUG="${ORIGIN_URL#*github.com[:/]}"; SLUG="${SLUG%.git}"

case "$BRANCH" in
  main)      JSON="$REPO_DIR/protection-mirror.json" ;;
  fork/main) JSON="$REPO_DIR/protection-integration.json" ;;
  *) echo "Unknown branch '$BRANCH' — expected 'main' or 'fork/main'." >&2; exit 1 ;;
esac

[[ -f "$JSON" ]] || { echo "Ruleset not found: $JSON" >&2; exit 1; }

echo "Applying protection to $SLUG#$BRANCH using $(basename "$JSON") ..."
gh api -X PUT "repos/$SLUG/branches/$BRANCH/protection" --input "$JSON" >/dev/null
echo "Applied. Active rules:"
gh api "repos/$SLUG/branches/$BRANCH/protection" \
  --jq '{required_checks: .required_status_checks.contexts, linear_history: .required_linear_history, force_pushes_allowed: .allow_force_pushes.enabled, deletions_allowed: .allow_deletions.enabled}'
