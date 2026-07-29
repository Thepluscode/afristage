# AfriStage — agent instructions

## The standard

**[docs/PRODUCT_BUILDING_STANDARD.md](docs/PRODUCT_BUILDING_STANDARD.md) is mandatory
and governs every change in this repository.** Read it before planning or writing
code. It defines the required pre-implementation output (problem, user, outcome,
workflow, acceptance criteria, invariants, failure cases, security, test plan),
the required post-implementation report (changes, files, test evidence,
verification status, remaining risks, next decision), and the definition of done.

That file is the single canonical copy. `AGENTS.md` points here; do not fork the
text into other files, or the copies will drift.

## How it relates to the existing doctrine

The company doctrine at `~/projects/theplus-tech-knowledge/doctrine/AGENTS.md`
(Premise Gate, the Build Standard, the 12 engineering rules) still applies. The
product standard is compatible with it and mostly more specific. Where both speak
to the same thing, the stricter requirement wins — neither relaxes the other.

## Status vocabulary

The standard's vocabulary governs: `PLANNED → SCAFFOLDED → IMPLEMENTED →
VERIFIED → PILOT-READY → PRODUCTION-READY`. Use it for new tracker entries and
for the per-change "Verification status" report.

`FEATURE_TRACKER.md` previously used `PLANNED → IN PROGRESS → DEPLOYED →
VERIFIED`. The historical entries were **not** relabelled — they were assessed
against the definitions in force when their evidence was gathered, and rewriting
the labels would imply a re-audit that did not happen. The tracker header carries
the mapping needed to read them.

Do not relabel historical entries as a side effect of unrelated work. If an old
`DEPLOYED` entry needs a current label, re-check its evidence first and say what
you checked.

`npm run validate:tracker` enforces the machine-checkable half of this in CI: a
status must be a real label, and `VERIFIED` / `PILOT-READY` / `PRODUCTION-READY`
must carry evidence that is not merely "tests pass" or "build succeeded". Whether
the evidence is *good* is your judgement, not the linter's.

## API error conventions

- **A missing single resource is a `404`** — never `200` with a `null` or empty
  body. A client cannot tell "gone" from "arrived empty", the response caches as
  though it were valid, and the failure is invisible in every dashboard. This is
  already the convention: 33 `NotFoundException` throws across the API.
- **An empty collection is `200` with `[]`** — never a `404`.
- **A database constraint the code did not anticipate must not reach the client
  as a `500`.** `PrismaExceptionFilter` maps known Prisma codes to honest 4xx
  (`P2002`→409, `P2025`→404, `P2003`/`P2014`→409, value errors→400) and
  deliberately leaves anything unmapped as a 500, so a real fault cannot hide
  behind a friendly message. Where a call site can say something specific — which
  field collided, and what to do about it — it should still catch its own error;
  the filter is the floor, not the ceiling.
- **`npm run validate:error-paths`** does every ordinary action twice and asserts
  nothing answers 5xx. Run it against a deployed environment, not just locally:
  the duplicate-signup 500 lived on the funnel's first screen because every other
  suite here drives the happy path with fresh, unique data.

## Repository facts an agent needs

- **Staging's seeded passwords are rotated randoms, not `Admin123!`.** A 401 on
  the deployed environment is almost always this, not a bug. Read them from
  `railway variables --service api --kv | grep STAGING_` — see
  `docs/phase-3-6-beta-launch-operations.md`. Local compose uses the plain ones.

- Monorepo: NestJS + Prisma API (`apps/api`), Next.js admin (`apps/admin-web`),
  Next.js web client (`apps/web`), Flutter mobile (`apps/mobile`), landing
  (`apps/landing`).
- `npx jest` in `apps/api` runs the API suite. `npx vitest run` in `apps/admin-web`.
- CI (`API CI`) runs unit tests, then a build, then `prisma migrate deploy`, then
  the seed, then the `scripts/validate-*.mjs` end-to-end suites against a live API.
  A failure in an early suite halts the rest — check which suite actually failed
  before concluding the pipeline is broken.
- The green checks that appear on `main` are often the scheduled `synthetic-check`
  probe, a **different** workflow. Confirm you are reading `API CI` before
  claiming CI is healthy.
- Coin pricing is server-owned: clients pick a `packageId`. Gift `quantity` is
  bounded at 10000. The E2E suites buy and gift through the `buyCoins` /
  `giftCoins` helpers in `scripts/_lib.mjs` — use those rather than posting
  purchase bodies directly.
- Money moves go through the `MoneyService` catalog, which owns idempotency keys
  and the non-negative guard. Do not call `LedgerService.postTransaction` from a
  feature service.
