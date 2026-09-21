# AGENT_CONTEXT — AfriStage

The stable charter. What this product is, what it may decide, and what it is
forbidden to do. Countable figures live in `PROJECT_STATE.json`; the current task
lives in `ACTIVE_WORK.yaml`; the durable engineering invariants live in
`CLAUDE-INVARIANTS.md`; the governing standard is
`docs/PRODUCT_BUILDING_STANDARD.md`.

## Mission

**AfriStage Live — an Africa-first live creator platform.** The v1 loop is six
steps and every one of them is the product: a creator goes live, a viewer joins,
the viewer chats and reacts, the viewer buys coins, the viewer sends gifts, the
creator earns.

Monorepo: NestJS + Prisma API (`apps/api`), Next.js admin (`apps/admin-web`),
Next.js web client (`apps/web`), Flutter mobile (`apps/mobile`), landing
(`apps/landing`).

## This repository moves real money

That is the fact that should change how a session behaves here, and it is the
reason the boundaries below are not style preferences. Coins are bought with
money, gifts convert to creator earnings, and earnings are paid out in fiat.

| Authority | The boundary | Where |
|---|---|---|
| Ledger writes | **Only `MoneyService` may post to the ledger.** A feature service calling `LedgerService.postTransaction` directly bypasses the idempotency key and the non-negative guard in one move. There is exactly one caller and it is `money.service.ts`. | `apps/api/src/modules/money/money.service.ts` |
| Idempotency keys | **Every ledger idempotency key in the system is minted in one file** (RFC #144). Keys built by hand at a call site are how a double-spend gets its own key and posts twice. | `apps/api/src/modules/money/money-keys.ts` |
| Balances | **A spend balance must never go negative** — user COIN, EARNING, PROMO. The overdraw fix relies on Postgres row locks and is covered by a real-DB concurrency test whose teeth were verified: remove the guard and the test overdraws. | `money.service.ts` |
| Coin pricing | **Server-owned.** Clients pick a `packageId`; they never send a price. | API |
| Gift quantity | **Bounded at 10000** by DTO validation, not by client goodwill. | `send-gift.dto.ts` |
| Cache keys | **Any new cache key must contain the owner.** A viewer-neutral cache answers before the query runs, holding the output of somebody else's permission check — row-level security bypassed entirely. There is one cache today (the public feed slice) and it is viewer-neutral by construction. | `validate:cross-user` |
| Missing resources | **A missing single resource is a `404`** — never `200` with a null or empty body. A client cannot tell "gone" from "arrived empty", the response caches as though valid, and the failure is invisible in every dashboard. | 33 `NotFoundException` throws |
| Unmapped DB faults | `PrismaExceptionFilter` maps known Prisma codes to honest 4xx and **deliberately leaves anything unmapped as a 500**, so a real fault cannot hide behind a friendly message. The filter is the floor, not the ceiling. | `PrismaExceptionFilter` |

## What this repository must not do

- **Must not label anything `VERIFIED` without evidence.** Build and tests passing
  alone is `IMPLEMENTED`. The vocabulary is
  `PLANNED → SCAFFOLDED → IMPLEMENTED → VERIFIED → PILOT-READY → PRODUCTION-READY`.
- **Must not relabel historical tracker entries as a side effect of unrelated
  work.** Entries before 2026-07-28 use the previous vocabulary and were assessed
  against the definitions in force when their evidence was gathered. Rewriting the
  labels would imply a re-audit that did not happen. If an old `DEPLOYED` entry
  needs a current label, re-check its evidence first and say what you checked.
- **Must not fork the product standard.** `docs/PRODUCT_BUILDING_STANDARD.md` is
  the single canonical copy and `AGENTS.md` points at it. Copying the text into
  other files is how the copies drift.
- **Must not claim CI is healthy from a green check on `main`.** Those are often
  the scheduled `synthetic-check` probe, a different workflow. Confirm you are
  reading `API CI`. GitHub Actions is billing-blocked, so CI evidence is
  currently unavailable and merges rest on local green.
- **Must not read a 401 on the deployed environment as a bug.** Staging's seeded
  passwords are rotated randoms, not the local compose ones. Read them from
  `railway variables --service api --kv | grep STAGING_`.

## Verification bar

Staging is the only deployed environment, so **"staging live" is the bar** — not
local-only. A money change is proven by a real funnel against the deployed API:
register → promote → live room → buy coins → gift → earnings → payout, followed
by a ledger-safe teardown that leaves `ledger_integrity_ok=1`.

## Verification

```bash
cd apps/api && npm test          # jest, not vitest, despite some docs
cd apps/admin-web && npx vitest run
cd apps/mobile && flutter test
npm run validate:money           # and 20-odd sibling suites; see package.json
npm run validate:cross-user      # can user B see user A's data, including via cache
npm run validate:error-paths     # every ordinary action twice, nothing answers 5xx
npm run validate:tracker         # a status must be real, and carry evidence
python3 scripts/check_continuity.py
```

`validate:error-paths` must be run against a deployed environment, not only
locally: the duplicate-signup 500 lived on the funnel's first screen because
every other suite drives the happy path with fresh, unique data.

`API CI` runs unit tests, then a build, then `prisma migrate deploy`, then the
seed, then the `validate-*` suites against a live API. **A failure in an early
suite halts the rest** — check which suite actually failed before concluding the
pipeline is broken.

## Where everything else lives

| | |
|---|---|
| The governing standard | `docs/PRODUCT_BUILDING_STANDARD.md` |
| Engineering invariants | `CLAUDE-INVARIANTS.md` |
| Current authorised task | `ACTIVE_WORK.yaml` |
| Discovered but unauthorised work | `PARKING_LOT.md` |
| Countable state | `PROJECT_STATE.json` (generated, gitignored) |
| Feature status and evidence | `FEATURE_TRACKER.md`, including its Verification debt section |
| Beta and launch operations | `docs/phase-3-6-beta-launch-operations.md`, `docs/go-live-checklist.md` |
| Recovery | `docs/disaster-recovery.md`, `docs/restore-drill-record.md` |
| Security | `docs/security-posture.md`, `docs/security-audit-readiness.md` |
