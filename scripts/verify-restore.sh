#!/usr/bin/env bash
# Restore/DR verification: a restore is not done until this passes.
# Usage: scripts/verify-restore.sh <API_BASE> [ADMIN_JWT] [LOGIN_IDENTIFIER] [LOGIN_PASSWORD]
#   API_BASE          e.g. https://api-production-e12f.up.railway.app/api  or  http://localhost:3000/api
#   ADMIN_JWT         optional — enables the ledger-integrity (money-intact) check
#   LOGIN_IDENTIFIER/PASSWORD  optional — enables the login smoke check
# See docs/disaster-recovery.md.
set -u
API="${1:?usage: verify-restore.sh <API_BASE> [ADMIN_JWT] [IDENT] [PW]}"
ADMIN="${2:-}"; IDENT="${3:-}"; PW="${4:-}"
fail=0
note() { printf '%-40s %s\n' "$1" "$2"; }

# 1. app is up
code=$(curl -s -o /tmp/vr_h -w '%{http_code}' --max-time 10 "$API/health")
status=$(grep -o '"status":"[^"]*"' /tmp/vr_h 2>/dev/null)
[ "$code" = "200" ] && [ "$status" = '"status":"ok"' ] && note "1. GET /health" "OK ($status)" || { note "1. GET /health" "FAIL (http $code $status)"; fail=1; }

# 2. dependencies reachable (db + redis)
ready=$(curl -s --max-time 10 "$API/health/ready")
echo "$ready" | grep -q '"db":true' && echo "$ready" | grep -q '"redis":true' \
  && note "2. GET /health/ready" "OK (db+redis up)" || { note "2. GET /health/ready" "FAIL ($ready)"; fail=1; }

# 3. money intact (admin-gated ledger integrity) — only if a token is supplied
if [ -n "$ADMIN" ]; then
  li=$(curl -s --max-time 15 "$API/admin/ledger/integrity" -H "authorization: Bearer $ADMIN")
  echo "$li" | grep -q '"ok":true' && echo "$li" | grep -q '"unbalancedTransactions":0' \
    && note "3. ledger integrity" "OK (balanced, 0 unbalanced)" || { note "3. ledger integrity" "FAIL ($li)"; fail=1; }
else
  note "3. ledger integrity" "SKIPPED (no ADMIN_JWT)"
fi

# 4. login smoke — only if creds supplied
if [ -n "$IDENT" ] && [ -n "$PW" ]; then
  lc=$(curl -s -o /tmp/vr_l -w '%{http_code}' --max-time 10 "$API/auth/login" -H 'content-type: application/json' -d "{\"identifier\":\"$IDENT\",\"password\":\"$PW\"}")
  grep -q accessToken /tmp/vr_l 2>/dev/null && note "4. login smoke" "OK (token issued)" || { note "4. login smoke" "FAIL (http $lc)"; fail=1; }
else
  note "4. login smoke" "SKIPPED (no login creds)"
fi

rm -f /tmp/vr_h /tmp/vr_l
echo "---"
[ "$fail" = 0 ] && { echo "RESTORE VERIFIED ✓"; exit 0; } || { echo "RESTORE VERIFICATION FAILED ✗"; exit 1; }
