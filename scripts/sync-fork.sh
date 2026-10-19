#!/usr/bin/env bash
# =============================================================================
# Phase 0 — upstream sync
#
#   main       fast-forwards to upstream/main (refuses if diverged), pushed
#   fork/main  merges the new main forward (merge commits expected), pushed
#   lists feat/* and fork/* branches that may want a rebase
#
# Recommended cadence: weekly, and before starting any new work.
# =============================================================================
set -euo pipefail

MIRROR="main"
INTEGRATION="fork/main"
UPSTREAM_REMOTE="upstream"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree must be clean before syncing." >&2
  exit 1
fi

git fetch "$UPSTREAM_REMOTE" --prune --tags

LOCAL="$(git rev-parse "$MIRROR")"
REMOTE="$(git rev-parse "$UPSTREAM_REMOTE/$MIRROR")"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  echo "main is up to date with upstream ($(git rev-parse --short "$LOCAL"))."
else
  if git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
    git checkout "$MIRROR"
    git merge --ff-only "$UPSTREAM_REMOTE/$MIRROR"
    echo "main: $(git rev-parse --short "$LOCAL") -> $(git rev-parse --short "$REMOTE") (local)"
  else
    echo "ERROR: local main has diverged from upstream/main — fast-forward refused." >&2
    echo "Recover manually, see FORK_GOVERNANCE.md -> Divergence recovery." >&2
    exit 1
  fi
fi

echo
echo "Updating $INTEGRATION ..."
git checkout "$INTEGRATION"
if git merge-base --is-ancestor "$MIRROR" "$INTEGRATION"; then
  echo "$INTEGRATION already contains main — nothing to merge."
else
  git merge --no-edit "$MIRROR"
  echo "$INTEGRATION merged forward locally."
fi
# Always retry pushes, including when an earlier run updated local refs only.
git push origin "$MIRROR"
git push origin "$INTEGRATION"
git checkout "$MIRROR"

echo
echo "Branches that may want a rebase onto the new main:"
git for-each-ref --format='  %(refname:short)' refs/heads/feat refs/heads/fork \
  | grep -v "$INTEGRATION" \
  | sed "s|^|  |" || echo "  (none)"
