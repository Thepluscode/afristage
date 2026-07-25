# Scope — Global creator payouts

Today creator payouts settle in **one currency at one rate** (`CREATOR_PAYOUT_CURRENCY=NGN`,
`COIN_TO_FIAT_MINOR_RATE=100`), regardless of where the creator is. This scopes making
payouts work for creators worldwide — in their own currency, and (later) via automated
international rails.

## The key fact that shrinks Phase A

The data model is **already per-request multi-currency**. `PayoutRequest` stores
`fiatCurrency`, `fiatMinor`, `coinToFiatMinorRate` as a **settlement snapshot** (coins stay
the authoritative unit; fiat is recorded per request), and `PayoutMethod` already has
`currency` + `country` per method. **The only thing that isn't global is `request()`** —
it computes the snapshot from the **global env** and *ignores the payout method's currency*:

```ts
const rate = Number(process.env.COIN_TO_FIAT_MINOR_RATE || 100);   // single global rate
const fiatCurrency = process.env.CREATOR_PAYOUT_CURRENCY || 'NGN'; // single global currency
```

So a creator whose payout method says `currency: GBP` still gets converted at the NGN rate
and recorded as NGN. **The ledger is unaffected** — the hold posts in COIN (currency-agnostic);
only the fiat *snapshot* is wrong. That's why Phase A is small and low-risk.

## Two phases (ship A now, gate B on demand)

### Phase A — Multi-currency payout accounting (RECOMMENDED)
Settle each payout in the creator's own currency, at that currency's published rate.
Disbursement stays **manual** (admin `mark-paid` after finance sends the transfer) — which
already works for any country via bank transfer.
- `request()`: derive `fiatCurrency` from the payout **method** (`method.currency`, fallback
  to the env default when no method), and `rate` from a **per-currency rate table** (env
  JSON, e.g. `COIN_FIAT_RATES={"NGN":100,"USD":..,"GBP":..,"EUR":..}`) instead of one env
  number. Snapshot `method.currency` into the request (add it to `destinationSnapshot`).
- Surface the currency in `/earnings` + the payout screen ("cash out ≈ £X").
- **No schema migration** (fields exist), **no ledger change**, no new provider.
- **Effort:** ~1–2 days (code + rate config + tests + live-verify a GBP-method payout records
  `fiatCurrency=GBP` at the GBP rate). **Risk:** low.

### Phase B — Automated international rails (Stripe Connect payouts) — later
Let creators onboard a payout destination in their own country and get paid programmatically.
- **Stripe Connect Express**: creator onboarding flow (Connect account + hosted KYC),
  `money.service` payout leg triggering a Connect transfer/payout, Connect webhooks →
  `mark-paid`/`failed`, per-country eligibility.
- Large: a new integration + KYC/AML + tax reporting (1099/DAC7) that scale per country —
  this is the real engineering + compliance lift.
- **Effort:** ~weeks + compliance. **Gate hard on demand** (see premise).

## The economic decision (not just code)
The per-currency rate table is a **pricing/FX decision**, not a default to hardcode: what is a
coin worth in each payout currency, given the buy price (₦1,000 / $1 → 100 coins) and the 60%
creator split? The current single `=100` rate is almost certainly a placeholder (it implies
1 coin ≈ 1 major unit, which doesn't reconcile with the buy price). Phase A must set each
currency's rate deliberately (and decide static-published vs. a daily FX feed — static is fine
for beta). **This decision blocks correct payouts more than the code does.**

## Premise gate (Rule 0)
**Make-or-break:** is there real demand from **non-African creators** to be paid — enough to
justify multi-currency payouts (A) and eventually Connect (B)? Per the Africa-first wedge,
this is expansion off the core. **Cheapest kill-test:** do you have even *one* non-African
creator asking to cash out? If not, Phase A is cheap insurance (do it so the moment one
appears you're not stuck), and Phase B is premature — **do not build Connect speculatively.**

## Recommendation
**Phase A now** (it's ~1–2 days, fixes a latent correctness bug — non-NGN methods are already
mis-converted — and unblocks paying a global creator operationally via manual transfer),
**with the rate table set as a real pricing decision.** **Phase B only when a real non-African
creator needs automated payout** — then Stripe Connect, with the compliance work scoped
separately.

## Explicitly OUT
Any ledger/COIN change (payouts stay coin-authoritative); changing the buy-side (viewers can
already pay globally via Stripe/USD); Connect integration (Phase B); tax/AML tooling (Phase B);
i18n of the UI (separate global-readiness workstream).
