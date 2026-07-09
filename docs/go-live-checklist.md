# Go-Live Checklist — Activating AfriStage in Production

The single actionable "flip to production" runbook. Everything below is a
credential or operational step **you** perform — the code is already merged and
verified. Work top to bottom; nothing here needs a code change.

Deeper context lives in [`phase-3-6-beta-launch-operations.md`](phase-3-6-beta-launch-operations.md),
[`phase-3-7-production-launch-hardening.md`](phase-3-7-production-launch-hardening.md),
and [`beta-readiness-checklist.md`](beta-readiness-checklist.md). This doc is the
checklist; those are the reference.

> **Credential rule:** secrets go into the deploy environment (Railway / your
> host's env vars or secret manager), **never** into git. The committed
> `.githooks/pre-commit` hook blocks accidental `.env` / live-key commits, but
> the discipline is yours. Prefer **restricted** keys (least privilege) wherever
> the provider offers them.

---

## 1. Payments — Paystack (African corridors: NGN/GHS/KES/ZAR)

- [ ] Create/confirm a live Paystack business account.
- [ ] Copy the **live secret key** → set `PAYSTACK_SECRET_KEY` in the API env
      (must not be `replace_me` — the boot gate rejects the placeholder).
- [ ] Add a Paystack webhook pointing at `POST https://<api-host>/payments/webhooks/paystack`.
      Paystack signs with HMAC-SHA512 of the raw body using the secret key — no
      separate webhook secret needed.
- [ ] Send one real ₦ test purchase; confirm coins credit and a `COIN_PURCHASE`
      ledger row appears.

## 2. Payments — Stripe (global cards: USD today)

Stripe ships **dark** — the provider self-guards via `isConfigured()` and stays
off until `STRIPE_SECRET_KEY` is set, so this step is what actually turns global
coin-buying on. It is *not* required by the boot gate (you can launch African-only
without it).

- [ ] Create the Stripe account; activate live mode.
- [ ] Create a **restricted key** (Checkout Sessions: write; Checkout Sessions +
      PaymentIntents: read) — not the full secret. Set `STRIPE_SECRET_KEY`.
- [ ] Add a Stripe webhook endpoint → `POST https://<api-host>/payments/webhooks/stripe`,
      subscribed to **`checkout.session.completed`**. Copy its signing secret →
      `STRIPE_WEBHOOK_SECRET`.
- [ ] Set redirect + replay-window env (defaults are fine to keep):
      - `STRIPE_SUCCESS_URL=https://afristage.live/wallet?paid=1`
      - `STRIPE_CANCEL_URL=https://afristage.live/wallet?canceled=1`
      - `STRIPE_WEBHOOK_TOLERANCE_SEC=300` (rejects replayed signatures older/newer than 5 min)
- [ ] Buy the `starter_usd` ($1.00 → 100 coins) tier with a real card; confirm the
      webhook fires, coins credit, and the ledger row records `fiatCurrency: USD`.

Routing is automatic: USD (and any non-African currency) → Stripe; NGN/GHS/KES/ZAR
→ Paystack. Nothing to configure per-currency.

## 3. Live streaming — LiveKit

- [ ] Provision a production LiveKit project.
- [ ] Set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (must not be the dev
      `devkey` / `secret` placeholders — the boot gate rejects them).
- [ ] Start one real live room end-to-end; confirm a viewer can join.

## 4. Admin MFA enrollment (required in production)

`REQUIRE_ADMIN_MFA=true` must be set (see §6). Each admin then enrolls once:

- [ ] Admin logs into the admin dashboard → **Security** page (`/security`).
- [ ] Click enable → scan the shown `otpauth` QR into an authenticator app →
      enter the 6-digit code. Backed by `POST /auth/mfa/setup` + `/auth/mfa/enable`.
- [ ] **Save the one-time recovery codes** shown on success — they are displayed
      once and never again.
- [ ] Repeat for every admin account before launch.

## 5. Named owners for the three operational queues

These are **people**, not config — assign a named owner (and a backup) for each
admin queue so nothing sits unwatched. Record the assignments here or in your ops
doc:

| Queue | Admin surface | Owner | Backup |
|-------|---------------|-------|--------|
| Payouts | `/payouts` — approve/settle creator payouts | _____ | _____ |
| Moderation | `/live-rooms` + `/reports` — reported rooms, takedowns | _____ | _____ |
| Support | `/support` — user tickets | _____ | _____ |

- [ ] Each owner has an MFA-enrolled admin account (see §4).
- [ ] Each owner knows their SLA (e.g. payouts within 24h, CRITICAL moderation
      reports within 1h — safety reasons auto-escalate to CRITICAL).

## 6. Production safety flags (boot gate)

Set on the API env — the boot validator refuses to start if any are wrong:

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random values (not `dev*` / `replace_*`)
- [ ] `DATABASE_URL`, `REDIS_URL` — production instances
- [ ] `REQUIRE_ADMIN_MFA=true`
- [ ] `ENABLE_MOCK_PAYMENTS` **unset or not `true`** (mock free-coin path stays off)
- [ ] `ALLOW_SEEDED_PROD_LOGIN` **unset or not `true`** (seeded test accounts blocked)
- [ ] `ADMIN_COOKIE_SECURE=true` (or serve admin over HTTPS)
- [ ] `NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` set

## 7. Final gate

- [ ] With the production env loaded, run:
      ```bash
      npm run launch:production
      ```
      This runs `validate-production-readiness.mjs --env` (env + flag checks in
      lockstep with the API boot validator) then the live launch gate. It must
      print **RESULT: N passed, 0 failed** before you flip traffic.
- [ ] Smoke the money path once more in prod: one Paystack purchase, one Stripe
      purchase, one payout request — each verified against the ledger.

---

## Rollback

Every step here is reversible by unsetting an env var and redeploying:

- **Disable Stripe** (global cards): unset `STRIPE_SECRET_KEY` → provider goes
  dark again; African corridors unaffected.
- **Disable all card checkout:** unset both provider secret keys → only the
  (production-blocked) mock path remains, i.e. no purchases.
- No data migration is involved in activation, so rollback is env-only and takes
  effect on the next deploy (< 5 min).
