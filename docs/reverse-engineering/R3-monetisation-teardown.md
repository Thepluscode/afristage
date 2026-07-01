# Phase R3 — Monetisation System Teardown

Clean-room teardown of the BIGO-style money machine, specified **against
AfriStage's actual implementation** (real services, real config defaults). Every
number below is what the code ships today, cited to its source, so this is an
economics review — not a proposal in a vacuum.

Sources: `apps/api/src/modules/gifts/gifts.service.ts`,
`apps/api/src/modules/payments/{payments.service.ts,coin-packages.ts}`,
`apps/api/src/modules/payouts/payouts.service.ts`,
`apps/api/prisma/seed.ts`, `docs/wallet-ledger-design.md`.

---

## 1. Currency model (LIVE)

Two currencies, deliberately decoupled (BIGO's Diamonds/Beans pattern, renamed):

| Concept | AfriStage | Where it lives |
| --- | --- | --- |
| Purchase currency | **Coins** | user `COIN` wallet account |
| Earning currency | **Creator Earnings** (still denominated in coins) | user `EARNING` account |
| In-flight payout | coins moved to hold | user `PAYOUT_HOLD` account |
| Platform take | | system `PLATFORM_REVENUE` account |
| Payment settlement | | system `PAYMENT_CLEARING` account |
| Payout settlement | | system `PAYOUT_CLEARING` account |

**Double-entry, always balanced.** Every money event is one ledger transaction
with matching DEBIT/CREDIT entries; the admin ledger-integrity check refuses
payouts if entries don't sum to zero (`GET /admin/ledger/integrity`). This is the
accounting backbone that makes payouts auditable and is AfriStage's structural
edge over a surface clone.

**Coin ≠ cash.** A coin has two different values: what a viewer *pays* for it
(purchase) and what a creator *cashes it out* for (payout). The gap between them
is a primary margin lever (see §7).

---

## 2. Buy side — coin packages (LIVE)

Server-authoritative pricing (`coin-packages.ts`); the client sends only a
package id, never amounts. Coins are credited **only** by a verified payment
webhook (or an idempotent verify call) — never on client claim — so a
double-tap or webhook+verify race can't double-credit (`creditCoins` is
idempotent on `SUCCEEDED`).

| Pack | Fiat | Coins | Effective buy price |
| --- | --- | --- | --- |
| starter | ₦1,000 | 100 | **₦10.00 / coin** |
| popular | ₦5,000 | 550 | ₦9.09 / coin |
| pro | ₦10,000 | 1,200 | ₦8.33 / coin |

Volume discount is mild (~17% from starter to pro). Ledger on credit:
`PAYMENT_CLEARING` DEBIT → user `COIN` CREDIT (`COIN_PURCHASE`).

---

## 3. Gift catalog + split economics (LIVE)

Seed catalog (coins), ordered by price — the status ladder:

| Gift | Coins | @ ₦10/coin buy cost | Creator earns (60%) | Creator cash (₦1/coin) |
| --- | --- | --- | --- | --- |
| Rose | 10 | ₦100 | 6 | ₦6.00 |
| Fire | 50 | ₦500 | 30 | ₦30.00 |
| Golden Mic | 100 | ₦1,000 | 60 | ₦60.00 |
| Drum | 200 | ₦2,000 | 120 | ₦120.00 |
| Crown | 500 | ₦5,000 | 300 | ₦300.00 |
| Spotlight | 1,000 | ₦10,000 | 600 | ₦600.00 |
| Star | 2,000 | ₦20,000 | 1,200 | ₦1,200.00 |
| Stage | 5,000 | ₦50,000 | 3,000 | ₦3,000.00 |

**The split (real):** `CREATOR_SHARE_BPS = 6000` → creator **60%**, platform **40%**.
On send: viewer `COIN` DEBIT `total` → creator `EARNING` CREDIT `0.6×total` →
`PLATFORM_REVENUE` CREDIT `0.4×total` (one balanced transaction). Idempotent per
(viewer, room, gift, client-nonce) so a resend after a network blip can't
double-charge.

---

## 4. Cash-out side — payout controls (LIVE)

| Control | Default | Env |
| --- | --- | --- |
| Minimum payout | **500 coins** | `MIN_PAYOUT_COIN` |
| Coin → fiat rate | **100 minor/coin = ₦1.00/coin** | `COIN_TO_FIAT_MINOR_RATE` |
| Payout currency | **NGN** | `CREATOR_PAYOUT_CURRENCY` |
| New-creator window | 14 days | `FRAUD_NEW_CREATOR_DAYS` |
| Large-payout flag | ≥ 1,000,000 coins | `FRAUD_LARGE_PAYOUT_COIN` |

Request flow (ledger): `EARNING` DEBIT → `PAYOUT_HOLD` CREDIT (coins leave
spendable earnings, sit in hold). Fiat snapshot (`coinAmount × rate`) is frozen
at request time. A new creator (< 14 days) requesting ≥ 1M coins is auto-flagged
for review. Reject returns the hold to `EARNING`; mark-paid requires an external
transfer reference. Approval is blocked while ledger integrity ≠ ok.

---

## 5. The margin waterfall (the headline finding)

Trace **one coin** bought on the starter pack, gifted, and cashed out:

```text
Viewer pays              ₦10.00   (buy 1 coin)
Viewer gifts 1 coin
  → creator EARNING      0.60 coin
  → platform REVENUE     0.40 coin
Creator cashes out 0.60 coin × ₦1.00/coin = ₦0.60
------------------------------------------------------------
Creator take-home:       ₦0.60   (6.0% of viewer spend)
Platform gross:          ₦9.40   (94%, before payment + payout rail fees)
```

**Effective creator realization** (cash reaching the creator ÷ viewer gross):

| Pack (buy price) | Realization at 60% share, ₦1/coin payout |
| --- | --- |
| starter (₦10.00) | **6.0%** |
| popular (₦9.09) | 6.6% |
| pro (₦8.33) | 7.2% |

Two compounding margin levers produce this: (a) the **40% gift fee**, and (b) a
**~8–10× coin buy/sell spread** (₦8.33–10 to buy, ₦1 to cash out). The spread
dominates.

> **Flag (evidence, not judgement):** 6–7% creator realization is very aggressive
> for a creator-acquisition play in a competitive African market. It maximises
> short-term margin but weakens the "creators earn real money" promise that R1
> identified as the core loop. This is a deliberate config decision — surfaced
> here so it's chosen, not defaulted into.

### Tuning lever (formula, grounded in the real config)

```text
creator_realization  =  CREATOR_SHARE  ×  (payout_₦_per_coin / buy_₦_per_coin)
today                =  0.60           ×  (₦1.00 / ₦10.00)  =  0.06
```

To reach a target realization `R` (holding buy price at ₦10, share at 60%):

```text
payout_₦_per_coin  =  R × ₦10 / 0.60
  R = 0.25 →  ₦4.17/coin  → COIN_TO_FIAT_MINOR_RATE ≈ 417
  R = 0.35 →  ₦5.83/coin  → COIN_TO_FIAT_MINOR_RATE ≈ 583
  R = 0.45 →  ₦7.50/coin  → COIN_TO_FIAT_MINOR_RATE ≈ 750
```

The two knobs are `CREATOR_SHARE_BPS` and `COIN_TO_FIAT_MINOR_RATE` (relative to
pack pricing). **Recommendation:** pick a target realization band explicitly
(a 25–40% band is competitive and still leaves a healthy platform margin), set
the two env values to hit it, and treat it as a launch decision reviewed with
finance — do not ship the ₦1/coin default silently. No code change is required to
move it; both are env-driven.

---

## 6. Ranking incentives (partial)

- **LIVE:** per-room **top gifters** (`GET /live-rooms/:roomId/top-gifters`) —
  the immediate status hook that converts gifting into recognition.
- **GAP (P1/P2):** persistent supporter ranks/badges, creator charts
  (city/country/category), family/circle rankings, time-windowed leaderboards.
  These are the *amplifiers* of the recognition atom that already exists — a
  leaderboard aggregation service reading gift-transaction sums, not a new money
  path.

Design rule (from R2 §11): ranking = **aggregation over existing gift
transactions**, never a new charge. Score windows (daily/weekly/all-time) are
pure reads over `GiftTransaction._sum.totalCoinAmount`.

---

## 7. Event monetisation (GAP — P2)

BIGO drives spikes with limited-time gifts + event leaderboards. AfriStage target
(no new money path — overlays on §3):

```text
- Event gift catalog: time-boxed gifts (start/end) flagged in the gift table.
- Event leaderboard: gift-sum aggregation scoped to eventId + window.
- Event gifts still split 60/40 and hit the same ledger — only the catalog
  visibility and the ranking scope are event-specific.
```

Africa framing (R1): Afrobeats nights, comedy rooms, diaspora weekends, gospel
challenges — scarcity + occasion, not new economics.

---

## 8. VIP / fan-club monetisation (GAP — P2) — "Supporter Circle"

BIGO monetises belonging via paid fan clubs / VIP. AfriStage target:

```text
- Supporter tier: a recurring or threshold-based relationship to a creator.
- Entry can be (a) a coin-priced join gift (reuses §3 split), or
  (b) a cumulative-gifting threshold (pure read over the ledger — free to run).
- Perks: badge in room, supporter-only chat colour, top-of-list recognition.
```

Prefer the **threshold model first** (no new billing surface, no subscription
dunning) — it turns existing gifting into loyalty status at zero new money-path
risk. Subscriptions (recurring charge) are P3 and need a billing/renewal service.

---

## 9. Where platform revenue actually accrues

```text
PLATFORM_REVENUE  ← 40% of every gift (CREATOR_SHARE_BPS)
buy/sell spread   ← realised when creators cash out coins worth ₦8.33–10 (bought)
                    at ₦1 (paid out); the ~₦7–9/coin difference stays on platform
PAYMENT/ PAYOUT clearing ← transient settlement accounts, net-zero at rest
```

Both revenue sources are visible in the ledger and reconcilable via
ledger-integrity — nothing is off-book. That transparency is the asset; the
*magnitude* (94% platform share of gross today) is the decision to revisit.

---

## 10. Handoff to R4 (Community / Growth systems)

R3 establishes: one currency model, one gift split, one payout path, all
env-tunable, all ledgered. R4 (families/circles, fan clubs, agencies, events,
missions, leaderboards, nearby, notifications) must, per the R2 rule, express
every mechanic as an **overlay on this money+ledger spine**:

```text
- Circles/families      → membership + point aggregation (reads), collective
                          gifting reuses §3; extend fraud rules to group flows first.
- Agencies              → creator↔agency relationship + commission as explicit
                          ledger entries (a third split leg), auditable.
- Events/missions       → catalog visibility + reward writes; rewards that grant
                          coins must debit a funded promo account (never mint).
- Leaderboards/nearby    → pure reads over existing tables.
```

The one hard rule carried through R1→R3: **no feature invents a new money path.**
Growth features are scoring, relationship, and visibility layers over the coin +
double-entry ledger that already ships.
