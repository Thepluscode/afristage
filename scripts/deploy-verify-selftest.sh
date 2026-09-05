#!/usr/bin/env bash
# Proves scripts/verify-deployed-commit.sh actually rejects a bad deploy.
#
# That script only ever runs in CI, against an origin that is hard to make lie on
# demand — so it is exercised here against a fake origin we control. It calls the
# REAL script, not a copy: a self-test written against duplicated logic passes
# happily while the thing it claims to cover rots.
#
# The red cases are the point. A verification step that has only ever been seen
# printing PASS is indistinguishable from one that returns 0 unconditionally, and
# that is precisely the failure mode this whole mechanism exists to prevent.
#
# Usage: scripts/deploy-verify-selftest.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY="$HERE/verify-deployed-commit.sh"
[ -f "$VERIFY" ] || { echo "missing $VERIFY"; exit 2; }

PORT="${SELFTEST_PORT:-8791}"
URL="http://127.0.0.1:$PORT/api/health"
pass=0; fail=0
ok() { if [ "$1" = 0 ]; then echo "  PASS  $2"; pass=$((pass+1)); else echo "  FAIL  $2"; fail=$((fail+1)); fi; }

# Asserts the script's exit status, so a red case that turns green is caught.
expect() { # expect <want-exit> <label> <sha> [attempts] [nap]
  local want="$1" label="$2" sha="$3" tries="${4:-2}" nap="${5:-0}"
  bash "$VERIFY" "$URL" "$sha" "$tries" "$nap" >/dev/null 2>&1
  local got=$?
  [ "$got" = "$want" ] && ok 0 "$label" || ok 1 "$label (wanted exit $want, got $got)"
}

body() { printf '%s' "$1" > /tmp/dvs_body; }

serve() {
  python3 - "$PORT" <<'PY' &
import http.server, socketserver, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        b = open('/tmp/dvs_body','rb').read()
        self.send_response(200); self.send_header('Content-Type','application/json')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY
  echo $! > /tmp/dvs.pid
  for _ in $(seq 1 40); do curl -fsS "$URL" >/dev/null 2>&1 && return 0; sleep 0.25; done
  echo "fixture server never came up on $PORT"; return 1
}
stop() { [ -f /tmp/dvs.pid ] && kill "$(cat /tmp/dvs.pid)" 2>/dev/null; rm -f /tmp/dvs.pid /tmp/dvs_body; }
trap stop EXIT

echo "=== deploy verification self-test ==="
body '{"status":"ok","service":"afristage-api","commit":"aaa111"}'
serve || exit 2

expect 0 "the current deployment is accepted"                       aaa111
expect 1 "a STALE deployment is rejected (the real bug)"            bbb222

body '{"status":"ok","service":"afristage-api"}'
expect 1 "a build predating the sha stamp is rejected"              aaa111

body '{"status":"ok","commit":"unknown"}'
expect 1 "'unknown' never counts as a match"                        aaa111
expect 2 "refuses to verify against an 'unknown' expectation"       unknown

body '<html>502 Bad Gateway</html>'
expect 1 "an HTML error page from the edge is rejected"             aaa111

body '{"status":"ok","commit":"ccc333"}'
expect 0 "matches once the rollout lands"                           ccc333

stop
expect 1 "an unreachable origin is rejected, not skipped"           aaa111

echo ""
echo "========================"
echo "  RESULT: $pass passed, $fail failed"
echo "========================"
[ "$fail" = 0 ] || exit 1
