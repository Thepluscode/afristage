#!/usr/bin/env bash
# Outside-in health check for the AfriStage beta. Runs OFF the API host (laptop
# cron / an external uptime service / a Railway cron) and probes the DEPLOYED
# public API — so it catches an API crash/deploy-fail the in-API @Crons can't
# (they die with the API). Alerts Slack on failure via the synthetic_check tool.
#
#   env:
#     AFRISTAGE_MONITOR_BASE   API base (default: staging). Include the /api suffix.
#     UPTIME_ALERT_WEBHOOK_URL Slack-shaped webhook (falls back to REVENUE_ALERT_WEBHOOK_URL)
#     REGION                   vantage-point label for the alert (default: external)
#   usage:
#     bash beta-uptime.sh              # probe once; exit 1 if any check fails
#     bash beta-uptime.sh --selftest   # verify failure-detection without alerting
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK=(python3 "$HERE/synthetic_check.py")
BASE="${AFRISTAGE_MONITOR_BASE:-https://api-production-e12f.up.railway.app/api}"
WEBHOOK="${UPTIME_ALERT_WEBHOOK_URL:-${REVENUE_ALERT_WEBHOOK_URL:-}}"
REGION="${REGION:-external}"
WH=(); [ -n "$WEBHOOK" ] && WH=(--alert-webhook "$WEBHOOK")

if [ "${1:-}" = "--selftest" ]; then
  "${CHECK[@]}" --selftest || exit 1
  # a definitely-unreachable target MUST be detected as failing (exit 1)
  if "${CHECK[@]}" --url "http://127.0.0.1:1/nope" --expect-status 200 --timeout 2 --region selftest >/dev/null 2>&1; then
    echo "beta-uptime selftest: FAIL — down target not detected"; exit 1
  fi
  echo "beta-uptime selftest: OK"; exit 0
fi

rc=0
# 1) API reachable + healthy
"${CHECK[@]}" --url "$BASE/health" --expect-status 200 --expect-body '"status":"ok"' \
  --max-latency-ms 5000 --region "$REGION" "${WH[@]}" || rc=1
# 2) Live-rooms list servable (the beta's core public read)
"${CHECK[@]}" --url "$BASE/live-rooms" --expect-status 200 \
  --max-latency-ms 5000 --region "$REGION" "${WH[@]}" || rc=1
# 3) Money integrity healthy (ledger-integrity cron gauge exposed on /metrics)
"${CHECK[@]}" --url "$BASE/metrics" --expect-status 200 --expect-body 'afristage_ledger_integrity_ok 1' \
  --max-latency-ms 5000 --region "$REGION" "${WH[@]}" || rc=1

[ $rc -eq 0 ] && echo "beta-uptime: all checks passed" || echo "beta-uptime: FAILURES (Slack-alerted if a webhook is set)"
exit $rc
