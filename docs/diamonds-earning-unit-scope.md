# Scope — "Diamonds" as the creator earning unit

Give creators the familiar BIGO/TikTok two-tier mental model (**coins** to spend,
**diamonds** to earn + cash out) **without** the thing that model usually hides —
the beans→diamonds spread. AfriStage's brand is *accountable earnings, every coin
on the ledger*; the diamond here is transparent by design.

## The key fact that shrinks this

The creator earning is **already a distinct account** — `WalletAccountType.EARNING`,
credited 60% of every gift (`CREATOR_SHARE_BPS`), cashed out to fiat at
`PAYOUT_FIAT_MINOR_RATE`. It's just *denominated in coins today*. So "diamonds" is a
**rename + transparent-rate presentation of an account that already exists**, not a
new currency to plumb.

## Two options (pick the depth)

### Option A — Diamonds = the earning unit, 1:1 with earning-coins (RECOMMENDED)
A **presentation + naming** change; the ledger stays single-currency (COIN).
- **1 diamond = 1 earned coin = 60% of a gifted coin.** A 100-coin gift → creator
  sees **"+60 💎"** (their 60% share), instead of "+60 earning coins."
- The EARNING balance is **surfaced as "diamonds"** everywhere a creator sees it;
  the coin↔diamond↔fiat rates are **published, not hidden** ("1 💎 = ₦1 at payout"
  from `PAYOUT_FIAT_MINOR_RATE`).
- **Backend unchanged** — no ledger currency, no money-service math, no
  double-entry change. `WalletService.summary` just exposes `diamondBalance`
  (= the existing `earningBalance`); gift-broadcast/notification copy and payout
  copy switch to diamonds.

**Changes:** `wallet.service.summary` (add `diamondBalance` alias for `earningBalance`);
gift `gift.sent` earning label; payout screen (show the 💎→fiat rate); mobile
`creator_screen` + `wallet_screen` earning labels; web `/wallet`. Copy + labels,
no money logic.
**Effort:** ~0.5–1 day. **Risk:** ~none (no ledger touch; a rename is reversible).

### Option B — Diamonds as a distinct ledger currency (NOT recommended for AfriStage)
Make `DIAMOND` a real second currency with its own coin↔diamond rate.
- A gift becomes **cross-currency**: viewer spends COIN, creator earns DIAMOND.
  Double-entry balances **per currency**, so this needs a DIAMOND issuance/reserve
  account + a conversion posting — the elegant single-currency ledger becomes two
  balanced sub-ledgers. The `ledger-integrity` @Cron already groups by currency, so
  the DIAMOND ledger must also net to zero.
- Buys you **independent rate tuning** (change the earn-rate without changing coin
  prices) — but that *reintroduces the hidden spread* the brand rejects, and roughly
  doubles money-model complexity (giftSplit, payout, reconciliation, chargeback all
  gain a currency).
**Effort:** ~1–2 weeks + a migration + re-verifying the whole money suite.
**Verdict:** only worth it if you specifically want a tunable, opaque earn-rate —
which is off-brand and off-strategy here.

## Premise gate (Rule 0)

**The make-or-break:** *does a named "diamonds" earning unit measurably improve
creator perception / onboarding vs. just calling earnings "coins" — enough to
justify the second name?* If false, the extra term is cognitive load for no gain
(two names for near-identical units), and you should keep single-coin.

**Cheapest kill-test (before building even Option A):** show 3–5 beta creators two
mocked earning screens — "you earned 60 coins" vs "you earned 60 💎 (cash out at
₦1 each)" — and ask which reads clearer / more motivating. Option A is cheap enough
that a soft signal is enough to green-light; if creators are indifferent, don't add
the term.

## Recommendation

**Option A.** It delivers the familiar two-tier UX and the "diamonds = my cash-out
balance" clarity, keeps the transparent published rate (on-brand), and touches
**zero money logic** — the EARNING account already is the diamond balance. Reserve
Option B for a future where you genuinely need an opaque, tunable earn-rate (you
don't, per the accountability strategy).

## Explicitly OUT (for Option A)
Second ledger currency; changing the 60/40 split; a hidden coins→diamonds spread;
any money-service / double-entry / migration change. Diamonds are a transparent
label for the earning coins, full stop.
