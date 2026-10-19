#!/usr/bin/env bash
# Run the same gates GitHub Actions runs, locally, before pushing.
#
# Quick local sanity checks, not a complete mirror of CI. The required workflow
# jobs additionally enforce coverage, CSS lint, browser tests and security scans.
# Use those jobs as the authoritative validation gates.
#
# Usage:  scripts/ci-preflight.sh [--skip-audit]
# Exit:   0 = selected checks passed, 1 = at least one selected check failed.
#
# Runs every gate rather than failing fast, so one invocation surfaces all
# problems instead of dribbling them out one push at a time.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_AUDIT=0
[[ "${1:-}" == "--skip-audit" ]] && SKIP_AUDIT=1

FAILED=()
run() {
  local label="$1" dir="$2"; shift 2
  printf '  %-34s' "$label"
  if (cd "$ROOT/$dir" && "$@") >/tmp/ci-preflight-out 2>&1; then
    echo "ok"
  else
    echo "FAIL"
    FAILED+=("$label")
    # Keep a trimmed excerpt so the caller can see why without re-running.
    {
      echo "----- $label -----"
      tail -25 /tmp/ci-preflight-out
      echo
    } >>/tmp/ci-preflight-failures
  fi
}

: >/tmp/ci-preflight-failures
echo "Running local sanity checks (full CI adds coverage, CSS, browser and security gates)"

# The published deployment file is generated. Checking it first because it costs
# nothing and because drift here is invisible to every maintainer — it only ever
# breaks the Quick Deploy path that no one on the team runs (#121).
run "compose: ghcr in sync"  .  node scripts/generate-ghcr-compose.mjs --check

run "backend: lint"        backend  npm run lint
run "backend: type-check"  backend  npx tsc --noEmit
run "backend: build"       backend  npm run build
run "backend: tests"       backend  npx jest --silent

# The platform-backup round trip against a real Postgres, as CI runs it with its
# service database. A throwaway container on a spare port; skipped without Docker.
e2e_pg() {
  local name=mtm-preflight-pg port=55433
  docker rm -f "$name" >/dev/null 2>&1
  docker run -d --name "$name" -e POSTGRES_PASSWORD=e2e -e POSTGRES_DB=mtm_e2e \
    -p "127.0.0.1:$port:5432" postgres:15-alpine >/dev/null || return 1
  local ok=1
  for _ in $(seq 1 30); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && { ok=0; break; }; sleep 1; done
  [[ $ok -eq 0 ]] && PG_E2E_URL="postgres://postgres:e2e@127.0.0.1:$port/mtm_e2e" \
    npx jest --silent "\.pg\.test\.ts$"
  local rc=$?
  docker rm -f "$name" >/dev/null 2>&1
  return $rc
}
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  run "backend: Postgres tests"     backend  e2e_pg
else
  printf '  %-34s%s\n' "backend: Postgres tests" "skipped (no Docker)"
fi
run "frontend: lint"       frontend npm run lint
run "frontend: type-check" frontend npx tsc --noEmit
run "frontend: tests"      frontend npm test
run "frontend: build"      frontend npm run build

if [[ $SKIP_AUDIT -eq 0 ]]; then
  run "frontend: audit (prod)" frontend \
    npm audit --omit=dev --audit-level=high
  run "backend: audit (prod)"  backend \
    npm audit --omit=dev --audit-level=high
fi

if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "All selected local sanity checks passed."
  exit 0
fi

echo
echo "FAILED: ${FAILED[*]}"
echo "Details in /tmp/ci-preflight-failures"
exit 1
