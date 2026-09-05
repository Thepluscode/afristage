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

## 0. Rehearse in test mode FIRST

Every payment test in this repo runs against our own mock, which agrees with our
assumptions by construction. Do this before touching a live key — it needs only a
free test-mode key, no business verification:

**Stripe has been through this (2026-08-01, below). Paystack has not** — if you
launch with Paystack, its first real naira card is also its first integration
test against the live API.

```bash
PAYSTACK_SECRET_KEY=sk_test_... STRIPE_SECRET_KEY=sk_test_... \
  npm run validate:provider-sandbox
```

It authenticates against the real API, creates a real hosted checkout, and
asserts the JSON they actually return still matches the shape our providers
parse. It refuses to run against a non-test key. Finish by paying the printed
checkout URL with a test card and replaying the webhook (`stripe listen
--forward-to localhost:3000/api/payments/webhooks/stripe`), which is the only
way to prove the signature path end to end.

Rehearse **only the processor(s) you are actually launching with** (§1).

- [ ] `validate:provider-sandbox` green against Paystack test mode — *only if
      launching with Paystack; skip for a Stripe-only launch*
- [x] `validate:provider-sandbox` green against Stripe test mode — 6/6, 2026-08-01
- [x] A test-card payment credits coins and writes a `COIN_PURCHASE` ledger entry — 2026-08-01, 0→100 coins, entries balanced
- [x] A replayed webhook is idempotent (no second credit) — 2026-08-01, real `stripe events resend`, still one txn

## 1. Payments — pick at least one processor

**Either processor is enough to launch.** The boot gate and `launch:production`
require *a* payment provider, not a named one: set `PAYSTACK_SECRET_KEY`, or
`STRIPE_SECRET_KEY`, or both. With neither, the API refuses to start —
`no payment provider configured`.

Which one you set decides **what is on the storefront**. `GET /payments/coin-packages`
lists only the tiers whose currency has a configured processor, because a tier
nobody can pay for is a dead button:

| Configured | Coin tiers offered | Buyer pays in |
|---|---|---|
| Stripe only | the three USD tiers | USD, any international card |
| Paystack only | the three NGN tiers | NGN |
| Both | all six | their own currency |

Currency routes the charge and is not configurable per-user: NGN/GHS/KES/ZAR →
Paystack, everything else → Stripe (`AFRICAN_CURRENCIES` in `payments.service.ts`).

> **Stripe-only is a real choice with a real trade-off.** Nigerian buyers pay in
> USD on an international card. That works, but domestic naira cards decline
> international USD charges far more often than they decline local NGN ones, and
> the buyer absorbs the FX spread. If NGN conversion matters, add Paystack later —
> it needs no code change, only the key.

### 1a. Paystack (African corridors: NGN/GHS/KES/ZAR) — optional

- [ ] Create/confirm a live Paystack business account.
- [ ] Copy the **live secret key** → set `PAYSTACK_SECRET_KEY` in the API env
      (must not be `replace_me` — the boot gate rejects the placeholder).
- [ ] Add a Paystack webhook pointing at `POST https://<api-host>/payments/webhooks/paystack`.
      Paystack signs with HMAC-SHA512 of the raw body using the secret key — no
      separate webhook secret needed.
- [ ] Send one real ₦ test purchase; confirm coins credit and a `COIN_PURCHASE`
      ledger row appears.

### 1b. Stripe (global cards: USD today)

Stripe ships **dark** — the provider self-guards via `isConfigured()` and stays
off until `STRIPE_SECRET_KEY` is set, so this step is what actually turns global
coin-buying on. Setting it alone is a complete, supported configuration; the USD
tiers become the whole storefront.

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

## 2. Live streaming — LiveKit

- [ ] Provision a production LiveKit project.
- [ ] Set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (must not be the dev
      `devkey` / `secret` placeholders — the boot gate rejects them).
- [ ] Start one real live room end-to-end; confirm a viewer can join.

## 3. Admin MFA enrollment (required in production)

`REQUIRE_ADMIN_MFA=true` must be set (see §5). Each admin then enrolls once:

- [ ] Admin logs into the admin dashboard → **Security** page (`/security`).
- [ ] Click enable → scan the shown `otpauth` QR into an authenticator app →
      enter the 6-digit code. Backed by `POST /auth/mfa/setup` + `/auth/mfa/enable`.
- [ ] **Save the one-time recovery codes** shown on success — they are displayed
      once and never again.
- [ ] Repeat for every admin account before launch.

## 4. Named owners for the three operational queues

These are **people**, not config — assign a named owner (and a backup) for each
admin queue so nothing sits unwatched. Record the assignments here or in your ops
doc:

| Queue | Admin surface | Owner | Backup |
|-------|---------------|-------|--------|
| Payouts | `/payouts` — approve/settle creator payouts | _____ | _____ |
| Moderation | `/live-rooms` + `/reports` — reported rooms, takedowns | _____ | _____ |
| Support | `/support` — user tickets | _____ | _____ |

- [ ] Each owner has an MFA-enrolled admin account (see §3).
- [ ] Each owner knows their SLA (e.g. payouts within 24h, CRITICAL moderation
      reports within 1h — safety reasons auto-escalate to CRITICAL).

## 5. Production safety flags (boot gate)

Set on the API env — the boot validator refuses to start if any are wrong:

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random values (not `dev*` / `replace_*`)
- [ ] `DATABASE_URL`, `REDIS_URL` — production instances
- [ ] **At least one of** `PAYSTACK_SECRET_KEY` / `STRIPE_SECRET_KEY` (§1) —
      neither may be `replace_me`. With both absent the API refuses to start.
- [ ] `REQUIRE_ADMIN_MFA=true`
- [ ] `ENABLE_MOCK_PAYMENTS` **unset or not `true`** (mock free-coin path stays off)
- [ ] `ALLOW_SEEDED_PROD_LOGIN` **unset or not `true`** (seeded test accounts blocked)
- [ ] `ADMIN_COOKIE_SECURE=true` (or serve admin over HTTPS)
- [ ] `NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` set

## 6. Final gate

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
