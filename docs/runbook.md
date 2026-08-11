# Runbook

## Staging (Railway)

- **API**: https://api-production-e12f.up.railway.app/api (project `afristage`,
  services: `api`, `admin-web`, `Postgres`, `Redis`). Health: `/api/health`,
  readiness `/api/health/ready` (checks db + redis).
- **Admin dashboard**: https://admin-web-production-803b.up.railway.app —
  log in with the rotated staging admin credentials. Talks to the API over the
  private mesh (`AFRISTAGE_API_BASE=http://api.railway.internal:8080/api` —
  Railway injects `PORT=8080` at runtime, so internal callers use 8080, not
  the app default 3000).
- **Deploy**: `railway up --service api` / `railway up --service admin-web`
  from the repo root. Each service's `RAILWAY_DOCKERFILE_PATH` variable picks
  its image (a `dockerfilePath` in railway.toml would override BOTH — don't
  add one back). Shared `railway.toml`: healthcheck `/api/health` (both apps
  serve it) + conditional prisma migrate (api image only).
- **Credentials**: seeded accounts exist but their passwords are ROTATED to
  strong randoms — read `STAGING_ADMIN_PASSWORD` / `STAGING_CREATOR_PASSWORD` /
  `STAGING_VIEWER_PASSWORD` from the api service's Railway variables. Never
  restore the well-known seed passwords on a public URL.
- **Posture (staging, not production)**: `ENABLE_MOCK_PAYMENTS=true` (money
  loop verifiable without cards), `REQUIRE_ADMIN_MFA=false`, `NODE_ENV` unset.
  Flipping to production needs: real `PAYSTACK_SECRET_KEY`, LiveKit Cloud
  URL/key/secret, `NODE_ENV=production`, `REQUIRE_ADMIN_MFA=true` — then
  `validate-env` enforces the rest at boot.
- **LiveKit**: LiveKit Cloud project `afristage-staging` is wired
  (`LIVEKIT_URL=wss://afristage-staging-wbr2ts77.livekit.cloud`, key/secret in
  Railway vars). Verified: API-issued tokens are accepted, the mobile app
  connects (participant visible via `RoomServiceClient`), and demo media
  publishes into app-created rooms (`lk room join --publish-demo <room>`).
  KNOWN LIMIT: the Android **emulator** cannot publish its camera
  (`setCameraEnabled` throws even with `hw.camera.front=emulated`) — camera
  publish must be verified on a physical device before wave 1.
- **Monitoring**: two cron entries on the ops Mac, every 5 min (`crontab -l`):
  reachability of both services (`tmp/synthetic-check.log`) and **ledger
  integrity** (`tmp/ledger-integrity-check.log`). Both alert through
  `synthetic_check.py`.

  **To make alerts actually page, create the hook file — this is the only
  manual step:**

  ```bash
  printf '%s' 'https://hooks.slack.com/services/XXX' > ~/.afristage-alert-webhook
  chmod 600 ~/.afristage-alert-webhook
  ```

  Cron reads it at run time (`ALERT_WEBHOOK=$(cat ~/.afristage-alert-webhook)`),
  so the URL is never in `crontab -l` or visible in `ps`, and rotating it means
  editing one file. The URL is never printed by the tool either — not even in
  error messages, because a malformed one raises an exception carrying the URL.

  **Exit codes** — `2` is separate from `1` on purpose:

  | Code | Meaning | Response |
  |---|---|---|
  | 0 | all healthy | none |
  | 1 | a target failed **and the alert was delivered** | handle the incident |
  | 2 | **alerting itself is broken** — the collector rejected the alert, or `--require-webhook` is set and none is configured | fix paging first; you are blind |

  Both cron entries pass `--require-webhook`, so an unconfigured hook is a
  *failing job* rather than a silent one. Until `~/.afristage-alert-webhook`
  exists they log `ALERTING NOT CONFIGURED` and exit 2 every 5 minutes. That is
  intended: the previous behaviour reported `1/1 healthy` while nothing could
  page anyone.

  Verify delivery without waiting for a real outage by pointing a probe at
  something known-bad:

  ```bash
  ALERT_WEBHOOK=$(cat ~/.afristage-alert-webhook) python3 tools/monitoring/synthetic_check.py \
    --url https://api-production-e12f.up.railway.app/api/health --expect-status 999 --region drill
  ```

  Expect **exit 1 and a message in the channel**. Exit 2 means the hook was
  rejected — a revoked or mistyped URL — and nothing was delivered. A drill that
  produces no message means the alerting is decoration; fix it before trusting
  it. Re-run the drill after any Slack workspace or app change, since that is
  when a hook silently stops working.

- **Ledger integrity alerting**: asserted with `--expect-metric`, which parses
  the Prometheus exposition format. **Do not use `--expect-body` for metrics.**
  It is a substring search, and this metric's own HELP text reads
  `# HELP afristage_ledger_integrity_ok 1 when the last integrity sweep was clean, 0 otherwise`
  — so `--expect-body 'afristage_ledger_integrity_ok 1'` matches the comment and
  reports a **corrupt ledger as healthy**. That was confirmed against the live
  endpoint, and the selftest carries it as a regression case.

  A metric that goes missing is a failure, not a pass, so a rename or a dropped
  gauge pages rather than silently ending the check.

- **Gauge freshness** (`--max-metric-age NAME=SECONDS`): a value assertion alone
  cannot see a **dead writer**. If the server-side sweep stops while the process
  stays up, `afristage_ledger_integrity_ok` keeps publishing the last `1` it ever
  wrote and every check passes forever. Demonstrated: the same response body
  passes `--expect-metric afristage_ledger_integrity_ok=1` with exit 0 while its
  timestamp is two hours old.

  Both sweeps (`LedgerIntegrityService`, `RevenueMonitorService`) run every 5
  minutes, so cron allows `900` seconds — three missed runs — before paging on
  `afristage_ledger_integrity_last_check_timestamp_seconds` and
  `afristage_revenue_last_check_timestamp_seconds`.

  A timestamp in the **future** also fails, beyond 120s of tolerance. That is
  not pedantry: a future timestamp produces a negative age, which satisfies any
  staleness limit permanently — it would silence the check for exactly the
  reason it exists.
- **Mobile against staging**: no code change needed —
  `flutter run --dart-define=API_BASE=https://api-production-e12f.up.railway.app/api`
  (an explicit `API_BASE` define always wins over the localhost defaults).
- **Launch gate against staging**: `API_BASE=<staging api> DATABASE_URL=<Railway
  DATABASE_PUBLIC_URL> SEED_ADMIN_PASSWORD=... SEED_CREATOR_PASSWORD=...
  SEED_VIEWER_PASSWORD=... npm run launch:beta:live` — the SEED_* overrides
  exist because staging rotates the seeded passwords.

## Local startup

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres redis livekit
npm install
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
npm run seed -w apps/api
npm run start:dev -w apps/api
```

## Health check

```bash
curl http://localhost:3000/api/health
```

## Tracing one request through the logs

Every response carries `x-request-id`, and every log line written while serving
that request carries the same value in its `requestId` field — including lines
from deep inside a service that never mention the request. The id is assigned by
the first middleware in the chain, ahead of CORS, the JWT guard and the
throttler, so a `401` or `429` is just as traceable as a `200`.

A user reporting a failure can be asked for the `x-request-id` from their
browser's network tab; otherwise send one yourself:

```bash
curl -sD- -H 'x-request-id: support-1234' http://localhost:3000/api/health -o /dev/null | grep -i x-request-id
railway logs --service api | grep support-1234        # every line for that request
```

A client-supplied id is only honoured if it matches `[A-Za-z0-9._-]{1,64}`;
anything else is replaced with a fresh UUID rather than sanitised, so an id in
the logs is never a forged log line and never collides with a real request's.

`npm run validate:correlation-id` (runs in CI) proves the chain against a live
API, including the rejected-request case that unit tests cannot see.

### Distributed tracing (optional, off by default)

Tracing is disabled unless a collector is configured. To enable:

| Variable | Effect |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector base URL, e.g. `http://otel-collector:4318`. **Unset = tracing off**, no SDK started. |
| `OTEL_SERVICE_NAME` | Service name on spans. Default `afristage-api`. |

Inbound/outbound HTTP, Express routing and Redis are instrumented; `/api/health`
is excluded so the probe does not become the bulk of the trace volume. While
tracing is on, log lines also carry `traceId`, which joins a log line to its span.

## Closed beta launch gate

Run the non-live gate before every beta build handoff:

```bash
npm run launch:beta
```

Run the live-stack gate before inviting or expanding a beta wave:

```bash
npm run launch:beta:live
```

Run the production gate before a production launch or production deploy approval:

```bash
npm run launch:production
```

The live gate expects the API, Postgres, Redis, LiveKit, and seeded beta accounts to be available.
The production gate also expects production environment variables to be present and safe.

## Daily beta operations

1. Run `npm run launch:beta:live`.
2. Check Admin → Dashboard for reports, failed payments, payout pressure, and support load.
3. Check Admin → Live Rooms during scheduled creator sessions.
4. Check Admin → Reports for Critical or High moderation work.
5. Check Admin → Payouts and Ledger Integrity before any payout approval.
6. Check Admin → Support and assign every open payment, payout, moderation, or creator ticket.
7. Check Admin → User Activity: personally reach out to every QUIET user (was active, now silent 3+ days with 0 meaningful actions this week) before they churn. Never-active accounts are an activation problem, not retention — handle separately.
8. Record Critical/High issues before approving the next invite wave.

## Common failures

### Prisma cannot connect

Check `DATABASE_URL` and confirm Postgres is healthy.

### LiveKit token fails

Check `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`.

### Gift fails with insufficient balance

Use mock payment intent and complete the mock payment.

### Ledger imbalance

Do not patch data manually. Investigate the failed transaction and reverse with a new transaction if needed.

### Payment issue

Check Admin → Payments, then wallet history. Do not manually credit coins until the provider reference and ledger transaction path are understood.

### Payout issue

Hold the payout with a reason, check Ledger Integrity, then approve/reject/mark paid only after the external transfer state is clear.

### Live room abuse

Use Admin → Reports and Admin → Live Rooms. Suspend the room first when immediate risk exists, then record the moderation reason and audit trail.

### Support backlog

Prioritise payment, payout, and moderation tickets. Internal notes must remain private; user-facing replies should be safe and specific.

## Security scanning (DAST)

Two stages, not competitors:

- **OWASP ZAP (free) — every release.** Catch the obvious HTTP-level issues
  (missing security headers, info disclosure, common misconfig) against the
  running API. With the stack up:
  ```
  docker run --rm zaproxy/zap-stable zap-baseline.py -t http://host.docker.internal:3000/api -I
  ```
  Current baseline: 0 FAIL. Security headers are set via `helmet` + a
  `Cache-Control: no-store` default in `apps/api/src/main.ts` (X-Powered-By
  removed; nosniff / X-Frame-Options / HSTS / Referrer-Policy added). Rule 10049
  "Non-Storable Content" is expected/benign — it confirms `no-store`.
- **Burp Suite Professional (paid) — quarterly / pre-major-launch.** Deep,
  authenticated, active penetration testing beyond automated baseline coverage.
  This is what third-party assessors use; budget for it before enterprise deals.

## LiveKit Cloud static IP ranges

**AfriStage does not currently allowlist LiveKit by IP, so these ranges are
reference-only.** Recorded here so the list is on hand if ingress/egress
filtering is ever introduced — and so the "do we need to act?" question does not
have to be re-answered from scratch each time LiveKit announces a change.

```
143.223.88.0/21
161.115.160.0/19
153.57.128.0/18    # added 2026-08-24, EU/US/India; other regions to follow
```

All three are valid concurrently; LiveKit commits to substantial notice before
retiring any. Traffic may originate from any of them at any time.

Why no action was needed (audited 2026-07-27):

- No CIDR blocks exist anywhere in the repo, and `railway.toml` defines no
  network rules.
- There is **no LiveKit webhook endpoint**. The only webhook receivers are
  `payments/webhooks/{paystack,stripe}`, and both authenticate by HMAC
  signature over the raw body — not by source IP.
- LiveKit is used only for local token minting (`AccessToken.toJwt()` in
  `apps/api/src/modules/live-rooms/livekit.service.ts`, no outbound call) and
  for the `LIVEKIT_URL` handed to clients — so **end-user devices** dial
  LiveKit directly, not our infrastructure.
- No SIP trunking and no LiveKit Agents are in use.

This changes the day any of the following becomes true — re-check then:

- A LiveKit webhook endpoint is added, **and** it is restricted by source IP
  rather than by signature.
- SIP trunking or LiveKit Agents are adopted.
- Egress filtering is placed in front of the API, or a WAF/Cloudflare IP rule is
  placed in front of the domain.
