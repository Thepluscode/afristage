# Scope — Web creator earnings view

Today creators manage earnings + payouts only on **mobile**. This adds a
diamonds-branded **creator earnings view on the web app** (`apps/web`) for
creators who prefer desktop. Mirrors the mobile surface; reuses the existing
API unchanged.

## The key fact that shrinks this

**Every endpoint already exists** (all `@UseGuards(JwtAuthGuard)`, reachable from
web through the existing `/api/proxy` cookie pattern — same as `/wallet`):

| Endpoint | Returns | Use |
|---|---|---|
| `GET /creators/me/dashboard` | `{ creator, avatarUrl, earnings, totalGiftTransactions, totalRooms, followers, totalWatchSeconds, topSupporters[] }` | The hero — `earnings` is the EARNING coin balance = **💎** |
| `GET /wallet/me` | `{ coinBalance, earningBalance, payoutHoldBalance }` | 💎 available (`earningBalance`) + 💎 pending payout (`payoutHoldBalance`) |
| `GET /payouts/me` | creator's payout requests | Payout history + status |
| `GET /creators/me` | creator status (`payoutEnabled`, `kycStatus`) | Gate the page / the payout button |
| `GET /wallet/me/ledger` | recent ledger entries | Optional transaction list |

**So this is a pure `apps/web` build — no new API, no ledger touch.** Diamonds
render exactly as mobile (#206): `earnings` is a coin count shown as `N 💎`; payout
converts 💎 → fiat at `COIN_TO_FIAT_MINOR_RATE` (default 100 minor/coin), currency
`CREATOR_PAYOUT_CURRENCY` (default NGN).

## Two options (pick the depth)

### Option A — Read-only earnings view (RECOMMENDED MVP)
New authed page `apps/web/app/earnings/page.tsx`:
- **💎 balance card**: available diamonds (`wallet.earningBalance`) + pending payout
  (`payoutHoldBalance`), with the cash-out value beside it (transparent, on-brand).
- **Lifetime stats** from the dashboard: gifts received, rooms hosted, followers,
  total watch-time, top supporters (reuse the `TopSupporters` component).
- **Payout history** (`/payouts/me`) — status list, read-only.
- **No write actions** — "Request a payout" links to the mobile flow (or a
  "coming to web" note). Payout requests stay on the KYC-gated mobile path.

**New files:** `app/earnings/page.tsx`, `lib/creator.ts` (fetch+type the dashboard/
payouts), tests. **Reuses:** `api()` proxy, `TopSupporters`, the `gems`-equivalent
formatter. **Effort:** ~1 day. **Risk:** low (read-only, no money mutation).

### Option B — Full parity (adds the write actions)
Option A **plus**: request-payout form (`POST /payouts/request` — min
`MIN_PAYOUT_COIN=500`, gated on `payoutEnabled && kycStatus==='APPROVED'`, with the
💎→fiat preview) and payout-method CRUD (`GET/POST/DELETE /payouts/methods`).
**Effort:** +2–3 days (forms, validation, KYC gating, method management, more tests).
**Verdict:** defer — moving money is a sensitive action already fully built + KYC-gated
on mobile; add web payouts only when a creator actually needs to cash out from desktop.

## One small API touch (only if you want the fiat "≈ ₦X" on web)
The 💎→fiat rate + currency live as server-only env in `payouts.service`. To show
"≈ ₦X" beside the diamond count, expose them — cheapest is to add
`payoutRate` + `payoutCurrency` to the `/creators/me/dashboard` response (2 fields,
no logic change). Otherwise Option A shows **💎 counts only** and defers the fiat
figure to the (mobile) payout screen where the conversion is actually applied.

## Routing & gating
- Page at `/earnings`, authed via `/api/proxy`; **401 → `/login?next=/earnings`**
  (existing `/wallet` pattern).
- **Gate to creators**: fetch `GET /creators/me`; a non-creator gets a "Become a
  creator" prompt → the apply flow, not the dashboard.
- Add a **"Creator earnings"** link on `/wallet`, shown only when `creators/me`
  says the user is an approved creator.

## Premise gate (Rule 0)
**Make-or-break:** *do creators actually want to review earnings / cash out on the
web, given mobile already does it fully?* If AfriStage's creators are 100%
mobile-first, this is low-value duplication. **Cheapest kill-test:** check whether
creator onboarding/retention touches web at all, or ask 3–5 beta creators if they'd
use a desktop earnings view. Option A is cheap enough that a soft yes green-lights
it; if it's purely mobile, skip and keep earnings mobile-only.

## Explicitly OUT
New API endpoints; any ledger/money-service change; the payout *request* + method
CRUD on web (that's Option B); changing the split or rate; admin payout controls
(those stay in admin-web).

## Recommendation
**Option A**, gated to creators, diamonds-branded to match #206 — a read-only
desktop earnings view is the 80% value at ~1 day and zero money-mutation risk.
Add the fiat display via the 2-field dashboard touch if you want "≈ ₦X"; add
Option B's write actions only when web payout demand is real.
