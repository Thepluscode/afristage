# Phase 3.7 — Production Launch Hardening

## Objective

Block unsafe production launch states before real users or real money are exposed. Phase 3.7 turns production assumptions into executable gates: admin MFA required, mock payments disabled, seeded accounts blocked, legal links visible, secure cookies enforced, and production configuration validated.

## Commands

Static production hardening check:

```bash
npm run validate:production-readiness
```

Production environment check:

```bash
npm run validate:production-readiness -- --env
```

Production launch gate:

```bash
npm run launch:production
```

`launch:production` expects production environment variables and a live stack. It should fail locally unless production-equivalent env is intentionally supplied.

## Hard Gates

| Gate | Enforcement |
|---|---|
| Production secrets are present | `apps/api/src/config/validate-env.ts` |
| Placeholder secrets rejected | `apps/api/src/config/validate-env.ts` |
| `REQUIRE_ADMIN_MFA=true` | API boot validation and production readiness validator |
| `ENABLE_MOCK_PAYMENTS` not `true` | API boot validation and production readiness validator |
| Seeded accounts blocked | `AuthService` rejects seeded identifiers in production |
| Admin cookie secure-aware | Admin login route uses HTTPS or `ADMIN_COOKIE_SECURE=true` |
| Terms/Privacy visible | Admin login, mobile login, registration, onboarding |
| Live beta smoke still passes | `launch:production` runs live beta gate |

## Production Environment Requirements

Required:

```text
NODE_ENV=production
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
DATABASE_URL
REDIS_URL
PAYSTACK_SECRET_KEY
REQUIRE_ADMIN_MFA=true
ADMIN_COOKIE_SECURE=true or ADMIN_BASE_URL=https://...
NEXT_PUBLIC_TERMS_URL or TERMS_URL
NEXT_PUBLIC_PRIVACY_URL or PRIVACY_URL
```

Must not be true (both are now **boot-fatal** — `validateEnv` refuses to start):

```text
ENABLE_MOCK_PAYMENTS=true
ALLOW_SEEDED_PROD_LOGIN=true
```

Optional, safe-defaulted (the season-2 knobs — set only to deviate from the default):

```text
METRICS_TOKEN                  # unset = /metrics open (private networks); set = requires Authorization: Bearer
CREATOR_SHARE_BPS=6000         # creator share of every gift
FEED_CACHE_TTL_SECONDS=10      # ranked-feed slice cache; 0 disables; clamp 0..300
FRAUD_ASSESSMENT_TTL_SECONDS=300  # cached fraud reads at money gates; 0 = always recompute; clamp 0..3600
MISSION_FRAUD_BLOCK=0.6        # risk score at/above which mission claims are blocked
CHAT_REDIS_ADAPTER=on          # 'off' disables cross-instance chat fan-out (single-instance escape hatch)
JWT_ACCESS_TTL=15m / JWT_REFRESH_TTL=30d
MIN_PAYOUT_COIN=500
```

## Monitoring (scrape + alert)

`GET /api/metrics` serves Prometheus exposition (guard with `METRICS_TOKEN` and
`scrape_configs.authorization` when the scraper crosses a network boundary).
Minimum alert rules for launch:

```yaml
# The money system is unbalanced — page immediately.
- alert: LedgerIntegrityFailure
  expr: afristage_ledger_integrity_ok == 0
  for: 1m
# The integrity cron is dead (sweeps run at boot + every 5 minutes).
- alert: LedgerIntegritySweepStale
  expr: time() - afristage_ledger_integrity_last_check_timestamp_seconds > 900
# A money move errored for a non-business reason (5xx-class) — investigate.
- alert: MoneyMoveFailures
  expr: increase(afristage_money_moves_total{outcome="failed"}[10m]) > 0
```

`outcome="rejected"` (insufficient balance, business guards) is normal traffic —
alert on rate anomalies only, never on presence.

The payment-path synthetic (`PaymentSyntheticService`, hourly, gated by
`PAYMENT_SYNTHETIC_ENABLED=true` — staging/mock only) runs the real money loop
end-to-end and exposes its verdict as a gauge. Unlike the revenue-drop alert
(which needs real checkouts to fire), this catches a broken pipeline in a quiet
window — before the first real customer:

```yaml
# The money loop itself failed — a mock purchase didn't credit, reverse, or the
# ledger came out unbalanced. The payment pipeline is broken; page.
- alert: PaymentSyntheticFailing
  expr: afristage_payment_synthetic_ok == 0
  for: 10m
# The probe stopped running (cron dead / flag flipped off) — we're blind to
# payment breakage. Runs hourly, so >2h stale is dead.
- alert: PaymentSyntheticStale
  expr: time() - afristage_payment_synthetic_last_run_timestamp_seconds > 7200
```

## Deploy & Rollback

Deploy (any Docker host):

1. Build + push the `apps/api` image (repo `Dockerfile`), tag with the git SHA.
2. Run DB migrations BEFORE switching traffic: `npx prisma migrate deploy` (idempotent, `No pending migrations` on a no-op).
3. Start the new image; `validateEnv` crashes it pre-listen on any missing/unsafe production config — a misconfigured deploy never takes traffic.
4. Verify: `GET /api/health` → ok; `GET /api/metrics` shows `afristage_ledger_integrity_ok 1` with a fresh `last_check` (the boot sweep); post-deploy smoke via `npm run launch:beta:live`.

Rollback (target: < 5 minutes):

1. Restart the previous image tag. **No database rollback is required**: every migration in the current line is additive (new tables/columns/enum values only), so the previous app version runs cleanly against the newer schema.
2. Never `migrate reset`/down in production. If a future migration is ever destructive, it must ship expand-contract (additive first, destructive in a later release once no deployed version reads the old shape).
3. After rollback, re-check `afristage_ledger_integrity_ok` and `GET /api/admin/ledger/integrity` — the money spine is the invariant that decides whether a rollback is *done*.

## Remaining Non-Code Launch Tasks

- Replace placeholder Terms and Privacy URLs with final legal URLs.
- Confirm production admin accounts have MFA enabled before `REQUIRE_ADMIN_MFA=true` is enforced.
- Remove or disable seeded demo users from production data.
- Configure real Paystack keys and webhook endpoint.
- Configure production LiveKit keys and media endpoint.
- Assign payout reviewer, moderation owner, and support owner for launch day.

## Completion Criteria

Phase 3.7 is complete when:

- `npm run validate:production-readiness` passes.
- `npm run validate:production-readiness -- --env` passes with production-equivalent env.
- `npm run launch:beta:live` passes.
- `npm run launch:production` is the required production deploy approval command.
