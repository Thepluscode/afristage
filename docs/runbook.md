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
- **Monitoring**: cron on the ops Mac probes both services every 5 min
  (`crontab -l`, logs in `tmp/synthetic-check.log`):
  `python3 tools/monitoring/synthetic_check.py --url .../api/health --url
  https://admin-web-production-803b.up.railway.app/api/health --expect-status
  200 --max-latency-ms 3000` — add `--alert-webhook <hook>` once a Slack or
  Discord hook exists so failures page instead of logging.
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
