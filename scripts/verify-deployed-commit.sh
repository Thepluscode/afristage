#!/usr/bin/env bash
# Is the commit we just pushed the commit that is actually serving traffic?
#
# "railway up exited 0" is not "the new code is live" — the CLI has returned 0
# while doing nothing at all (see verification-traps: a command can exit 0 having
# done nothing). This is the step that turns a deploy from an upload into a
# deploy: it polls the real origin until /api/health reports the expected commit,
# and fails if it never does.
#
# It exists because the deployed API served pre-2026-08-11 code for about four
# weeks while every green check agreed things were fine. Nothing on the wire
# distinguished a stale deployment from a current one.
#
# Usage: verify-deployed-commit.sh <health-url> <expected-sha> [attempts] [sleep-seconds]
#
# Lives in a script rather than inline in the workflow so that
# scripts/deploy-verify-selftest.sh exercises THIS code and not a copy of it —
# a self-test against a duplicate of the logic passes happily while the real
# thing rots.
set -uo pipefail

URL="${1:?usage: verify-deployed-commit.sh <health-url> <expected-sha> [attempts] [sleep]}"
EXPECTED="${2:?expected commit sha required}"
ATTEMPTS="${3:-60}"
NAP="${4:-10}"

# 'unknown' is what the API reports when no sha was stamped. Accepting it would
# make every unstamped build look like a successful deploy of whatever we asked
# for, which is the failure this script exists to prevent.
if [ "$EXPECTED" = "unknown" ] || [ -z "$EXPECTED" ]; then
  echo "REFUSED: expected sha is '${EXPECTED}' — nothing could be verified against that."
  exit 2
fi

echo "expecting commit $EXPECTED at $URL"
live=""
for i in $(seq 1 "$ATTEMPTS"); do
  body=$(curl -fsS --max-time 10 "$URL" 2>/dev/null || true)
  # `// empty` so a body with no commit field yields '' rather than the string
  # "null", which would otherwise read as a value.
  live=$(printf '%s' "$body" | jq -r '.commit // empty' 2>/dev/null || true)
  if [ "$live" = "$EXPECTED" ]; then
    echo "live commit matches after $(( (i - 1) * NAP ))s"
    exit 0
  fi
  echo "  [$i/$ATTEMPTS] live=${live:-<unreachable or no commit field>}"
  [ "$i" -lt "$ATTEMPTS" ] && sleep "$NAP"
done

echo "::error::The API still reports '${live:-<unreachable>}', not $EXPECTED."
echo "::error::The deploy did NOT land. Do not assume it succeeded because earlier steps were green."
exit 1
