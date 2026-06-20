#!/usr/bin/env bash
# Phase 2.3 — narrated end-to-end demo of the AfriStage money loop against the
# HARDENED API (coinAmount + idempotencyKey payouts, state guards, fraud holds).
# Happy path + abuse paths + ledger integrity. Exits non-zero on any failure.
set -uo pipefail

API="${API:-http://localhost:3000/api}"
STAMP="$(date +%s)"
PASS=0; FAIL=0
ok()   { if [ "$1" = "$2" ];  then echo "  PASS  $3"; PASS=$((PASS+1)); else echo "  FAIL  $3 (got '$1' want '$2')"; FAIL=$((FAIL+1)); fi; }
okne() { if [ "$1" != "$2" ]; then echo "  PASS  $3"; PASS=$((PASS+1)); else echo "  FAIL  $3 (got '$1')"; FAIL=$((FAIL+1)); fi; }
command -v jq >/dev/null || { echo "need jq"; exit 1; }

# curl helper: $1 method, $2 path, $3 token(optional), $4 json body(optional).
# writes body to $BODY, returns http code in $CODE.
BODY=/tmp/afri-e2e-body
req() {
  local m="$1" p="$2" tok="${3:-}" data="${4:-}"
  local args=(-s -o "$BODY" -w '%{http_code}' -X "$m" "$API$p" -H 'Content-Type: application/json')
  [ -n "$tok" ] && args+=(-H "Authorization: Bearer $tok")
  [ -n "$data" ] && args+=(-d "$data")
  CODE="$(curl "${args[@]}")"
}
jqr() { jq -r "$1" "$BODY"; }
SQL() { docker exec afristage-postgres-1 psql -U afristage -d afristage -t -A -c "$1"; }

echo "=== 1. Health ==="
req GET /health; ok "$CODE" 200 "health 200"; jqr '.'

echo "=== 2. Login seeded users ==="
req POST /auth/login "" '{"identifier":"viewer@afristage.local","password":"Viewer123!"}';  VTOK=$(jqr '.accessToken')
req POST /auth/login "" '{"identifier":"creator@afristage.local","password":"Creator123!"}'; CTOK=$(jqr '.accessToken')
req POST /auth/login "" '{"identifier":"admin@afristage.local","password":"Admin123!"}';     ATOK=$(jqr '.accessToken')
okne "$VTOK" "null" "viewer token"; okne "$CTOK" "null" "creator token"; okne "$ATOK" "null" "admin token"

echo "=== 3. Viewer buys mock coins ==="
req POST /payments/coin-purchase-intents "$VTOK" '{"amountMinor":10000000,"currency":"NGN","coinAmount":100000}'; PI=$(jqr '.id')
req POST "/payments/mock/$PI/complete" "$VTOK"; ok "$CODE" 201 "mock payment completed"
req GET /wallet/me "$VTOK"; echo "  viewer coin balance: $(jqr '.coinBalance')"

echo "=== 4. Creator starts a fresh live room ==="
req POST /admin/live-rooms/end-stale "$ATOK" '{"maxIdleMinutes":0}'   # clear any active room
req POST /live-rooms "$CTOK" '{"title":"Friday Night Afrobeats","category":"MUSIC","country":"NG","language":"pidgin"}'; ROOM=$(jqr '.id')
req POST "/live-rooms/$ROOM/start" "$CTOK"; ok "$CODE" 201 "creator started room"; ok "$(jqr '.status')" LIVE "room is LIVE"

echo "=== 5. Viewer joins ==="
req POST "/live-rooms/$ROOM/join-token" "$VTOK"; ok "$CODE" 201 "viewer got join token"

echo "=== 6. Gift catalogue + 7. send gift (qty 100 of 10-coin = 1000 coins) ==="
req GET /gifts; GIFT=$(jqr '.[0].id'); echo "  gift: $GIFT"
req GET /wallet/me "$VTOK"; VBEFORE=$(jqr '.coinBalance')
req POST "/live-rooms/$ROOM/gifts" "$VTOK" "{\"giftId\":\"$GIFT\",\"quantity\":100,\"idempotencyKey\":\"gift-$STAMP\"}"
ok "$CODE" 201 "gift sent"; GIFTTX=$(jqr '.id'); echo "  creator earned: $(jqr '.creatorEarningMinor'), platform fee: $(jqr '.platformFeeMinor')"

echo "=== 8. Duplicate gift (same key) must NOT double-charge ==="
req POST "/live-rooms/$ROOM/gifts" "$VTOK" "{\"giftId\":\"$GIFT\",\"quantity\":100,\"idempotencyKey\":\"gift-$STAMP\"}"
ok "$(jqr '.id')" "$GIFTTX" "duplicate returns same gift transaction"
req GET /wallet/me "$VTOK"; VAFTER=$(jqr '.coinBalance')
ok "$((VBEFORE - VAFTER))" 1000 "viewer charged exactly once (1000 coins)"

echo "=== 9/10. Wallets ==="
req GET /wallet/me "$VTOK"; echo "  viewer:  coin=$(jqr '.coinBalance')"
req GET /wallet/me "$CTOK"; echo "  creator: earning=$(jqr '.earningBalance')"

echo "=== NEGATIVE: insufficient balance ==="
req POST "/live-rooms/$ROOM/gifts" "$VTOK" "{\"giftId\":\"$GIFT\",\"quantity\":999999999,\"idempotencyKey\":\"broke-$STAMP\"}"
ok "$CODE" 400 "gift beyond balance rejected (400)"

echo "=== NEGATIVE: creator cannot gift themselves ==="
req POST "/live-rooms/$ROOM/gifts" "$CTOK" "{\"giftId\":\"$GIFT\",\"quantity\":1,\"idempotencyKey\":\"self-$STAMP\"}"
ok "$CODE" 400 "self-gift rejected (400)"

echo "=== 11-14. Payout REJECT returns funds to earnings ==="
EARN_BEFORE=$(SQL "select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='EARNING'")
req POST /payouts/request "$CTOK" "{\"coinAmount\":500,\"idempotencyKey\":\"payoutA-$STAMP\"}"; PAYA=$(jqr '.id'); ok "$(jqr '.status')" UNDER_REVIEW "payout A under review"
req GET /admin/payouts "$ATOK"; ok "$CODE" 200 "admin lists payouts"
req POST "/admin/payouts/$PAYA/reject" "$ATOK" '{"reason":"phase 2.3 reject test"}'; ok "$(jqr '.status')" REJECTED "payout A rejected"
EARN_AFTER=$(SQL "select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='EARNING'")
ok "$EARN_AFTER" "$EARN_BEFORE" "rejected payout returned funds to earnings"

echo "=== Payout APPROVE -> mark-paid, and cannot pay twice ==="
req POST /payouts/request "$CTOK" "{\"coinAmount\":500,\"idempotencyKey\":\"payoutB-$STAMP\"}"; PAYB=$(jqr '.id')
req POST "/admin/payouts/$PAYB/approve" "$ATOK"; ok "$(jqr '.status')" APPROVED "payout B approved"
req POST "/admin/payouts/$PAYB/mark-paid" "$ATOK"; ok "$(jqr '.status')" PAID "payout B marked paid"
req POST "/admin/payouts/$PAYB/mark-paid" "$ATOK"; ok "$CODE" 409 "paid payout cannot be paid twice (409)"

echo "=== 15-17. Report + suspend room ==="
req POST /reports "$VTOK" "{\"roomId\":\"$ROOM\",\"reason\":\"SPAM\",\"details\":\"phase 2.3\"}"; ok "$CODE" 201 "viewer reported room"
req GET /admin/reports "$ATOK"; ok "$CODE" 200 "admin lists reports"
req POST "/admin/live-rooms/$ROOM/suspend" "$ATOK" '{"reason":"phase 2.3 suspend"}'; ok "$CODE" 201 "admin suspended room"

echo "=== 18. Suspended room cannot be joined / receive gifts ==="
req POST "/live-rooms/$ROOM/join-token" "$VTOK"; ok "$CODE" 400 "suspended room not joinable (400)"
req POST "/live-rooms/$ROOM/gifts" "$VTOK" "{\"giftId\":\"$GIFT\",\"quantity\":1,\"idempotencyKey\":\"after-suspend-$STAMP\"}"
ok "$CODE" 400 "suspended room cannot receive gifts (400)"

echo "=== 19. Ledger integrity (every transaction balances) ==="
UNBAL=$(SQL "select count(*) from (select transaction_id from ledger_entries group by transaction_id having sum(case when direction='CREDIT' then amount_minor else -amount_minor end) <> 0) x")
ok "$UNBAL" 0 "ledger integrity SQL returns zero unbalanced transactions"
GD=$(SQL "select coalesce(sum(amount_minor),0) from ledger_entries where direction='DEBIT'")
GC=$(SQL "select coalesce(sum(amount_minor),0) from ledger_entries where direction='CREDIT'")
ok "$GD" "$GC" "global debits == credits ($GD == $GC)"

echo ""
echo "========================================"
echo "  Phase 2.3 E2E:  $PASS passed, $FAIL failed"
echo "========================================"
[ "$FAIL" -eq 0 ]
