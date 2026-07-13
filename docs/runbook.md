# Runbook

## Staging (Railway)

- **API**: https://api-production-e12f.up.railway.app/api (project `afristage`,
  services: `api`, `Postgres`, `Redis`). Health: `/api/health`, readiness
  `/api/health/ready` (checks db + redis).
- **Deploy**: `railway up --service api` from the repo root (`railway.toml`
  sets the Dockerfile path and `prisma migrate deploy` as the pre-deploy step).
- **Credentials**: seeded accounts exist but their passwords are ROTATED to
  strong randoms — read `STAGING_ADMIN_PASSWORD` / `STAGING_CREATOR_PASSWORD` /
  `STAGING_VIEWER_PASSWORD` from the api service's Railway variables. Never
  restore the well-known seed passwords on a public URL.
- **Posture (staging, not production)**: `ENABLE_MOCK_PAYMENTS=true` (money
  loop verifiable without cards), `REQUIRE_ADMIN_MFA=false`, `NODE_ENV` unset.
  Flipping to production needs: real `PAYSTACK_SECRET_KEY`, LiveKit Cloud
  URL/key/secret, `NODE_ENV=production`, `REQUIRE_ADMIN_MFA=true` — then
  `validate-env` enforces the rest at boot.
- **LiveKit**: `LIVEKIT_URL` points at a placeholder — room start/gift/chat
  APIs work (tokens sign locally); actual media streaming needs a LiveKit
  Cloud project before creator sessions can be tested end-to-end.
- **Monitoring**: `python3 tools/monitoring/synthetic_check.py --url
  https://api-production-e12f.up.railway.app/api/health --expect-status 200
  --max-latency-ms 3000 [--alert-webhook <slack-hook>]` — schedule from any
  vantage point outside Railway.

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
7. Record Critical/High issues before approving the next invite wave.

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
