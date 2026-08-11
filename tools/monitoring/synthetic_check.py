#!/usr/bin/env python3
"""Outside-in synthetic health check — probe your service from OUTSIDE, and alert when it fails.

Your server asking itself if it feels OK will report healthy while users in another region
can't reach it. Real monitoring is outside-in. Run THIS from external vantage points — a
scheduled CI job, or (better) the same job deployed to several regions — not from the box
you're monitoring.

  python3 synthetic_check.py --url https://api.example.com/health --expect-status 200 --max-latency-ms 2000
  python3 synthetic_check.py --url https://a --url https://b --expect-body '"status":"ok"'
  python3 synthetic_check.py --url https://api.example.com/health --region eu-west-1 \
        --alert-webhook https://hooks.slack.com/services/XXX
  python3 synthetic_check.py --selftest

Exit 0 = all healthy. 1 = a target failed (and the alert was delivered). 2 = ALERTING ITSELF
IS BROKEN — the webhook rejected the alert, or --require-webhook was set and none is
configured. 2 is separate from 1 on purpose: "the service is down" and "the service is down
and nobody was told" need different responses, and the second is worse.

On failure, POSTs a JSON alert to --alert-webhook (Slack-shaped {"text": ...}; any generic
collector accepts it too), defaulting to $ALERT_WEBHOOK so the URL need not appear in a
crontab or a process listing. The URL is never printed, including in error messages.
Stdlib only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

# Bounded, but far above a realistic /metrics page. The old 4096-byte read
# truncated the AfriStage metrics body (5143 bytes) — the ledger gauge sat at
# byte 3103 and would have slid out of view behind one more counter, turning a
# real assertion into "metric missing" without anyone touching the check.
MAX_BODY_BYTES = 1_048_576


def metric_value(body: str, name: str) -> float | None:
    """Value of one Prometheus sample, or None if absent. Comment lines ignored.

    Substring matching CANNOT do this job. A metric's own HELP text may contain
    the sample line verbatim — AfriStage publishes

        # HELP afristage_ledger_integrity_ok 1 when the last integrity sweep was clean, 0 otherwise

    so `--expect-body 'afristage_ledger_integrity_ok 1'` matched the comment and
    reported a CORRUPT ledger as healthy. Verified against the live endpoint.
    """
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition(" ")
        if not sep:
            continue
        if key.split("{", 1)[0] == name:  # tolerate name{label="v"} samples
            try:
                return float(value.strip())
            except ValueError:
                return None
    return None


def classify(result: dict, cfg: dict) -> tuple[bool, list[str]]:
    """Pure decision: is this probe healthy? Returns (ok, reasons_it_failed). Unit-tested."""
    reasons = []
    if result.get("error"):
        return False, [f"unreachable: {result['error']}"]
    if cfg.get("expect_status") is not None and result["status"] != cfg["expect_status"]:
        reasons.append(f"status {result['status']} != {cfg['expect_status']}")
    if cfg.get("max_latency_ms") is not None and result["latency_ms"] > cfg["max_latency_ms"]:
        reasons.append(f"latency {result['latency_ms']:.0f}ms > {cfg['max_latency_ms']}ms")
    if cfg.get("expect_body") and cfg["expect_body"] not in (result.get("body") or ""):
        reasons.append(f"body missing {cfg['expect_body']!r}")
    for name, expected in (cfg.get("expect_metric") or {}).items():
        actual = metric_value(result.get("body") or "", name)
        if actual is None:
            # Absent is a failure, not a pass. A renamed or dropped metric must
            # page rather than quietly stop being checked.
            reasons.append(f"metric {name} missing")
        elif actual != expected:
            reasons.append(f"metric {name}={actual:g} != {expected:g}")
    return (len(reasons) == 0), reasons


def probe(url: str, timeout: float) -> dict:
    """One outside-in request. Never raises — failure is data, not an exception."""
    start = time.monotonic()
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "synthetic-check/1"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(MAX_BODY_BYTES).decode("utf-8", "replace")
            return {"status": resp.status, "latency_ms": (time.monotonic() - start) * 1000,
                    "body": body, "error": None}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "latency_ms": (time.monotonic() - start) * 1000, "body": "", "error": None}
    except Exception as e:
        return {"status": 0, "latency_ms": (time.monotonic() - start) * 1000, "body": "", "error": str(e)}


# Exit codes. 2 is deliberately distinct from 1: "the service is down" and "the
# service is down AND nobody was told" need different responses, and the second
# is the more urgent of the two.
EXIT_HEALTHY = 0
EXIT_TARGET_FAILED = 1
EXIT_ALERTING_BROKEN = 2


def send_alert(webhook: str, region: str, failures: list[dict]) -> bool:
    """POST the alert. True only if the collector ACCEPTED it.

    This used to swallow every failure into a stderr WARN, which is how alerting
    rots: a revoked or mistyped hook returns 404 forever while the probe keeps
    exiting 0 on healthy runs, so broken paging is indistinguishable from
    working paging until the day you need it.

    The webhook URL is never printed. urllib raises ValueError carrying the URL
    itself for a malformed one, and this output goes to a log file.
    """
    lines = [f"🔴 Synthetic check FAILED (region={region})"]
    for f in failures:
        lines.append(f"• {f['url']} — {'; '.join(f['reasons'])}")
    payload = json.dumps({"text": "\n".join(lines)}).encode()
    try:
        req = urllib.request.Request(webhook, data=payload, method="POST",
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
            if 200 <= resp.status < 300:
                return True
            print(f"ALERT DELIVERY FAILED: collector returned HTTP {resp.status}", file=sys.stderr)
            return False
    except urllib.error.HTTPError as e:
        print(f"ALERT DELIVERY FAILED: collector returned HTTP {e.code}", file=sys.stderr)
        return False
    except Exception as e:
        # Type name only — the message may contain the URL.
        print(f"ALERT DELIVERY FAILED: {type(e).__name__}", file=sys.stderr)
        return False


def run(urls, cfg, region, webhook, timeout, require_webhook: bool = False) -> int:
    if require_webhook and not webhook:
        print("ALERTING NOT CONFIGURED: no webhook (set $ALERT_WEBHOOK or --alert-webhook).")
        print("Refusing to report health: a failure right now would page nobody.", file=sys.stderr)
        return EXIT_ALERTING_BROKEN

    failures = []
    for url in urls:
        ok, reasons = classify(probe(url, timeout), cfg)
        status = "OK " if ok else "FAIL"
        print(f"  [{status}] {url}" + ("" if ok else f"  — {'; '.join(reasons)}"))
        if not ok:
            failures.append({"url": url, "reasons": reasons})

    print(f"{len(urls) - len(failures)}/{len(urls)} healthy (region={region})")
    if not failures:
        return EXIT_HEALTHY
    if not webhook:
        print("NOT PAGED: targets failed and no webhook is configured.", file=sys.stderr)
        return EXIT_TARGET_FAILED
    if not send_alert(webhook, region, failures):
        return EXIT_ALERTING_BROKEN
    return EXIT_TARGET_FAILED


def selftest() -> int:
    cfg = {"expect_status": 200, "max_latency_ms": 2000, "expect_body": '"ok"'}
    assert classify({"status": 200, "latency_ms": 120, "body": '{"status":"ok"}', "error": None}, cfg)[0]
    assert not classify({"status": 500, "latency_ms": 120, "body": "", "error": None}, cfg)[0]
    assert not classify({"status": 200, "latency_ms": 9000, "body": '"ok"', "error": None}, cfg)[0]
    assert not classify({"status": 200, "latency_ms": 10, "body": "nope", "error": None}, cfg)[0]
    assert not classify({"status": 0, "latency_ms": 30000, "body": "", "error": "timed out"}, cfg)[0]
    # No expectations configured => only reachability matters.
    assert classify({"status": 204, "latency_ms": 50, "body": "", "error": None}, {})[0]
    ok, reasons = classify({"status": 503, "latency_ms": 5000, "body": "", "error": None},
                           {"expect_status": 200, "max_latency_ms": 2000})
    assert not ok and len(reasons) == 2, reasons  # both status and latency cited

    # --- metric assertions -------------------------------------------------
    # REGRESSION: this exact body reported a corrupt ledger as HEALTHY, because
    # the HELP comment contains "afristage_ledger_integrity_ok 1" verbatim and
    # --expect-body is a substring search. Copied from the live endpoint.
    broken = (
        "# HELP afristage_ledger_integrity_ok 1 when the last integrity sweep was clean, 0 otherwise\n"
        "# TYPE afristage_ledger_integrity_ok gauge\n"
        "afristage_ledger_integrity_ok 0\n"
        "afristage_ledger_unbalanced_transactions 2\n"
    )
    healthy = broken.replace("integrity_ok 0", "integrity_ok 1").replace("transactions 2", "transactions 0")

    # The old substring check cannot tell these two apart — that is the bug.
    assert "afristage_ledger_integrity_ok 1" in broken and "afristage_ledger_integrity_ok 1" in healthy

    assert metric_value(broken, "afristage_ledger_integrity_ok") == 0.0
    assert metric_value(healthy, "afristage_ledger_integrity_ok") == 1.0
    assert metric_value(healthy, "afristage_no_such_metric") is None
    # A prefix of a longer metric name must not match it.
    assert metric_value("afristage_ledger_integrity_ok_total 7\n", "afristage_ledger_integrity_ok") is None
    # Labelled samples are still readable.
    assert metric_value('http_requests{code="500"} 3\n', "http_requests") == 3.0

    mcfg = {"expect_metric": {"afristage_ledger_integrity_ok": 1.0}}
    ok, reasons = classify({"status": 200, "latency_ms": 10, "body": broken, "error": None}, mcfg)
    assert not ok and "=0 != 1" in reasons[0], reasons
    assert classify({"status": 200, "latency_ms": 10, "body": healthy, "error": None}, mcfg)[0]
    # A metric that vanished must page, not silently stop being checked.
    ok, reasons = classify({"status": 200, "latency_ms": 10, "body": "", "error": None}, mcfg)
    assert not ok and "missing" in reasons[0], reasons

    # --- alerting-is-broken paths ------------------------------------------
    # Driven against real sockets, not mocks: the bug being prevented is that a
    # collector REJECTS the alert, which only a real response can express.
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    delivered: list[bytes] = []

    def serve(code: int):
        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                delivered.append(self.rfile.read(int(self.headers.get("content-length", 0))))
                self.send_response(code)
                self.end_headers()

            def do_GET(self):  # the probe target itself
                self.send_response(500)
                self.end_headers()

            def log_message(self, *a):
                pass

        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv

    down = serve(200)
    target = f"http://127.0.0.1:{down.server_port}/health"
    cfg200 = {"expect_status": 200}

    # Missing webhook is invisible today; --require-webhook makes it a failure
    # even while every target is healthy.
    assert run([target], cfg200, "t", None, 2, require_webhook=True) == EXIT_ALERTING_BROKEN
    # Without the flag, a failing target with no webhook is still just 1.
    assert run([target], cfg200, "t", None, 2) == EXIT_TARGET_FAILED

    # Accepted alert => the target failure is the story (1), not the alerting.
    hook_ok = serve(200)
    before = len(delivered)
    assert run([target], cfg200, "t", f"http://127.0.0.1:{hook_ok.server_port}/hook", 2) == EXIT_TARGET_FAILED
    assert len(delivered) == before + 1, "alert was not actually delivered"

    # REGRESSION: a collector that rejects (revoked/mistyped hook) used to be
    # swallowed into a WARN and still exit 1. It must now exit 2.
    hook_bad = serve(404)
    assert run([target], cfg200, "t", f"http://127.0.0.1:{hook_bad.server_port}/hook", 2) == EXIT_ALERTING_BROKEN
    # Nothing listening at all is equally broken.
    assert run([target], cfg200, "t", "http://127.0.0.1:1/hook", 2) == EXIT_ALERTING_BROKEN
    # A malformed URL must not crash — and must not be echoed (checked by eye in
    # send_alert: only the exception TYPE is printed).
    assert run([target], cfg200, "t", "not-a-url", 2) == EXIT_ALERTING_BROKEN

    for s in (down, hook_ok, hook_bad):
        s.shutdown()

    print("synthetic_check.py selftest: OK")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Outside-in synthetic health check")
    p.add_argument("--url", action="append", default=[], help="target URL (repeatable)")
    p.add_argument("--expect-status", type=int, help="required HTTP status (e.g. 200)")
    p.add_argument("--max-latency-ms", type=float, help="fail if slower than this")
    p.add_argument("--expect-body", help="substring that must appear in the body")
    p.add_argument("--expect-metric", action="append", default=[], metavar="NAME=VALUE",
                   help="Prometheus sample that must equal VALUE (repeatable). Parses the "
                        "exposition format, so HELP/TYPE comments cannot satisfy it.")
    p.add_argument("--timeout", type=float, default=10.0, help="per-request timeout (s)")
    p.add_argument("--region", default="local", help="vantage-point label for the alert")
    p.add_argument("--alert-webhook", default=os.environ.get("ALERT_WEBHOOK"),
                   help="Slack-shaped webhook to POST on failure (default: $ALERT_WEBHOOK, so the "
                        "URL stays out of crontab and process listings)")
    p.add_argument("--require-webhook", action="store_true",
                   help="exit 2 unless a webhook is configured. Use in cron: it turns "
                        "'nobody wired up paging' from invisible into a failing job.")
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args(argv)
    if args.selftest:
        return selftest()
    if not args.url:
        p.error("at least one --url is required")
    metrics = {}
    for pair in args.expect_metric:
        name, sep, value = pair.partition("=")
        if not sep:
            p.error(f"--expect-metric expects NAME=VALUE, got {pair!r}")
        try:
            metrics[name.strip()] = float(value)
        except ValueError:
            p.error(f"--expect-metric value must be numeric, got {value!r}")
    cfg = {"expect_status": args.expect_status, "max_latency_ms": args.max_latency_ms,
           "expect_body": args.expect_body, "expect_metric": metrics}
    return run(args.url, cfg, args.region, args.alert_webhook, args.timeout, args.require_webhook)


if __name__ == "__main__":
    sys.exit(main())
