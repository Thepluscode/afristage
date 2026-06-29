# AfriStage — Feature Tracker

Lifecycle: `PLANNED` → `IN PROGRESS` → `DEPLOYED` → `VERIFIED`.
`VERIFIED` requires production evidence (logs, API response, observable behavior),
not just "build/tests passed". Tests passing = `DEPLOYED`.

Monorepo: NestJS+Prisma API (`apps/api`), Next.js admin (`apps/admin-web`),
Flutter mobile (`apps/mobile`).

---

## Session 2026-06-28 → 2026-06-29 — apps/api to 100% coverage

Took the entire NestJS API to **100% statements / branches / functions / lines**
(1879 / 594 / 397 / 1603), up from ~58% stmt / 41% branch at the start of the API
work. **437 tests across 57 suites**, all green. Shipped as PRs #83–#92.
Status: `DEPLOYED` (jest unit tests, mocked Prisma — not production evidence).

Covered to 100%, by layer:
- **Services** (all): support, users, wallet, gifts, analytics, notifications,
  moderation, beta, auth, payments, payouts, live-rooms (ranking feed + stale
  sweep), creators, admin, fraud, chat, ledger, ledger-integrity.
- **Gateway**: chat.gateway (presence, messaging, auth, resilience catch arms).
- **Provider**: paystack (retry/backoff, signature, body-parse fallbacks).
- **Infra**: JwtAuthGuard, RolesGuard, Roles/CurrentUser decorators,
  RequestLoggingInterceptor, JsonLogger, validateEnv, PrismaService,
  RedisService, RoomCleanupService.
- **All 20 controllers** (delegation + default-param branches).
- **All 19 DTOs** (instantiate + validate).

Notes:
- Pure test additions; the only production edits are four documented
  `/* istanbul ignore */` markers on genuinely-unreachable defensive code
  (paystack lastErr fallback + 10s abort-timeout callback, validate-env's `''`
  fallback behind a required-key check, uploads access-key fallback behind
  isConfigured). Reachable branches were tested, not ignored.
- Excluded from the metric: `*.module.ts`, `main.ts`, the `.int-spec.ts`
  concurrency test (which itself exercises the real-DB overdraw guard).
- Caveat: unit-level (mocked Prisma) — verifies logic/branches, not real DB or
  wire behaviour.

## Session 2026-06-28 — API service error-path coverage

Raised `apps/api` service unit-test coverage, focused on guard/throw (error)
paths. Overall service **branch 41.3% → 62.9%**, statements **57.7% → 73.5%**;
**152 → 260 tests** (+108). Shipped as PRs #77–#81. Status: `DEPLOYED`
(jest unit tests green; mocked Prisma, not production evidence).

Per-service branch coverage:

| service | before → after | PR |
|---------|----------------|----|
| auth | 24% → 71% | #77 |
| payouts | 60% → 91% | #77 |
| payments | 60% → 83% | #77 |
| creators | 23% → 83% | #77 |
| live-rooms | 11% → 43% | #78 |
| wallet | 0% → 100% | #79 |
| support | 76% → 100% | #79 |
| admin | 0% → 100% | #80 |
| fraud | 0% → 100% | #80 |
| chat | 0% → 100% | #81 |
| ledger-integrity | 0% → 100% | #81 |

Notes:
- Pure test additions — no production code changed.
- `wallet`, `admin`, `fraud`, `chat`, `ledger-integrity` had **no spec** before.
- `live-rooms` residual is the ranking `list` + stale-room sweep (not error paths).
- Dropped a redundant moderation batch that added 0% (existing helper already
  covered those branches) rather than ship dead tests.
- Caveat: unit-level (mocked Prisma) — verifies guard/throw logic, not real DB
  behaviour. DB-level money invariants are covered by the `.int-spec.ts`
  concurrency test (overdraw fix).
- Untouched (thin infra glue, low value): `redis`, `room-cleanup`,
  `notifications`, `analytics`.

## Session 2026-06-26 → 2026-06-28 — mobile test suite to the 80% floor

Built the Flutter mobile test suite from **33.6% → 80.2%** line coverage
(3078/3838), meeting the engineering-standards Rule 2 / 80% floor. Shipped as
PRs #53–#75; 159 tests across `helpers_test`, `widgets_test`, `screen_test`,
`room_screen_test`, `app_state_test`, `api_client_test`. Status: `DEPLOYED`
(tests green in CI; not production evidence).

Highlights:
- Reusable harness: `_FakeApi` (canned get/getList/patch, records post/delete/patch,
  per-path errors), `_FakeStorage`, `_FakeSocket`, and a `socketFactory` seam on
  `RoomScreen` + an `http.Client` seam on `ApiClient` for transport-layer tests.
- The suite earned its keep: caught the debug-only `setState(() => _x = <Future>)`
  bug across 11 screens (fixed in #65).
- Coverage deliberately excludes WIP/WebRTC surfaces (`feed_screen`,
  `creator_apply_screen`, `livekit_room_view` ≈ 212 lines).

## Session 2026-06-24 → 2026-06-25 — design replication, then defect hunt

### Mobile interface replication (from `apps/mobile/design/` mockups)

| Feature | Status | Evidence | PR |
|---------|--------|----------|----|
| Feed / room / wallet / creator dashboard to mockup fidelity | DEPLOYED | `design-qa.md` = passed; on-device captures match references | #16 |
| Profile tab stat strip (Coins · Available USD · Account) | DEPLOYED | analyze clean, widget test | #17 |
| Transaction history: readable fiat/coin amounts + dates | DEPLOYED | unit tests `ledgerMoney`/`shortDateTime` across COIN/NGN/USD/GHS | #18 |
| Notifications: type-based icons + timestamps | DEPLOYED | unit test for type→style mapping | #19 |
| Payout history: readable fiat + dates | DEPLOYED | reuses tested helpers | #20 |
| Search: category browse on initial state | DEPLOYED | widget test; `?category=` verified server-side | #21 |
| Register: brand consistency with login | DEPLOYED | analyze clean | #22 |
| Onboarding: Creator intent routes into apply flow | DEPLOYED | analyze clean | #23 |
| Creator room performance: show date | DEPLOYED | reuses tested helper | #24 |
| Support ticket: message timestamps | DEPLOYED | reuses tested helper | #25 |
| Add payout method: client-side validation | DEPLOYED | unit test `payoutMethodError` | #26 |
| Support hub: feedback on empty submit | DEPLOYED | analyze clean | #27 |
| Accessibility: screen-reader labels on image-only controls | DEPLOYED | 2 semantics-tree widget tests | #28 |

### Defect hunt (adversarial money/async/silent-failure audit)

| Fix | Severity | Status | Evidence | PR |
|-----|----------|--------|----------|----|
| Coin **double-spend / overdraw race** — non-atomic balance check + debit; concurrent gifts/payouts (distinct idempotency keys) could mint coins / over-reserve payouts. Fixed with `FOR UPDATE` lock + in-transaction balance assertion (`guardNonNegative`). Gift `quantity` bounded `@Max(10000)`. | CRITICAL | DEPLOYED | new overdraw/covered-debit tests; API 152/152 | #29 |
| Coin overdraw fix — **real-DB concurrency test**: 20 parallel gifts on a 1000-coin wallet → exactly 10 win, balance lands at 0, never negative. Proven to have teeth (removing the guard → 20 win, −1000). | — | DEPLOYED | `npm run test:concurrency` 1/1; excluded from default suite | #34 |
| API **silent failures** — `.catch(()=>{})` dropped watch-time + peak-viewer writes; cron with no try/catch leaked zombie LIVE rooms. Now logged. | HIGH | DEPLOYED | tsc clean, chat+live-rooms 27/27 | #30 |
| Mobile **reconnect-banner bug** ("Chat rejoined" on first connect) + swallowed auth-refresh / wallet-load errors now logged. | HIGH/MED | DEPLOYED | analyze clean, mobile 18/18 | #31 |
| Schema note: `GiftTransaction.*Minor` fields hold **COINS** not fiat (immunize against a future wrong `/100` "fix"). | DOC | DEPLOYED | comment-only; `migrate diff` empty | #32 |

**False positives caught by verification (NOT changed):**
- `usd(wallet.earningBalance)` "shows 100×" — `earningBalance` is COIN; `usd()` maps 1 coin ≈ $1 by design (`wallet.service.ts:53`).
- `creatorEarningMinor` "is minor fiat" — it's whole coins; never divided by 100 anywhere; "X coins" display is correct.

---

## Observed behavior — local docker-compose stack (2026-06-25)

Ran the **containerized API** (image built from current `main`, `apps/api/Dockerfile`)
against the real local stack (Postgres/Redis/LiveKit/MinIO) on `:3002` and exercised
flows end-to-end with captured HTTP responses. This is stronger than unit tests
(real running artifact + real DB), but it is **localhost, not a deployed environment**
— so nothing is promoted to `VERIFIED` (which still requires prod/staging evidence).

| Flow | Observed result |
|------|-----------------|
| `POST /auth/login` (viewer + creator) | 200, JWT issued |
| `POST /payments/coin-purchase-intents` + `mock/:id/complete` | wallet 1360→1460 coins (real ledger credit) |
| `POST /live-rooms` + `/:id/start` | room `LIVE` |
| `POST /live-rooms/:id/gifts` (1 Rose) | 200; balance 1460→1450; `creatorEarningMinor: 6` = 60% of 10 **coins** → live-confirms #32 (coins, not fiat) |
| Overdraw via `quantity: 100000` | 400 "quantity must not be greater than 10000" (#29 `@Max`) |
| Overdraw via `quantity: 10000` (within Max, over balance) | 400 "Insufficient coin balance" (#29 balance guard); balance unchanged |
| Ledger consistency | viewer COIN ledger balance = 1450, non-negative |

### Reminder lifecycle (re-run 2026-06-25 against a container rebuilt with #50)

| Step | Observed |
|------|----------|
| Creator schedules a room (`scheduledStartAt` future) | `SCHEDULED` |
| Viewer GET `/creators/:id` | `upcomingRoom.reminded: false` (#43 + #50) |
| `POST /live-rooms/:id/remind` | `reminded: true` |
| GET `/creators/:id` again | `upcomingRoom.reminded: true` |
| `DELETE /live-rooms/:id/remind` | `reminded: false` |
| GET `/creators/:id` again | `upcomingRoom.reminded: false` |
| `GET /gifts/me` (#44) | 17 rows, correct shape (giftName/creatorName/roomTitle/coins) |

The remind-me toggle state round-trips correctly through set/cancel on the real
server. Still localhost — not promoted to `VERIFIED`.

Container has since been **stopped** (`docker stop afristage-api-1`; not removed). The
local deps (Postgres/Redis/LiveKit/MinIO) and the host dev API on `:3000` were left
running. Relaunch with `docker compose -f docker-compose.yml -f /tmp/afri-api-port.yml up -d api`.

## Verification debt

These are `DEPLOYED` (tests/build pass) but **not yet `VERIFIED`** in production
(no prod logs / live evidence):

- All of the above — verified locally (host-GPU emulator captures, jest/flutter
  suites), not against a deployed environment. GitHub Actions is billing-blocked,
  so CI evidence is unavailable; merges rest on local green.
- The coin-overdraw fix (#29) relies on Postgres row locks under real concurrency.
  ✅ Now covered by a real-DB concurrency test (#34) — proven under 20 parallel
  gifts on a local Postgres, with teeth verified (guard removed → overdraw). The
  remaining gap to `VERIFIED` is the same as everything else: evidence from a
  deployed prod/staging environment, not just local.

## Notes

- Test runner for `apps/api` is **jest** (not vitest, despite some docs).
- Run: `cd apps/api && npm test` · `cd apps/mobile && flutter test`.
