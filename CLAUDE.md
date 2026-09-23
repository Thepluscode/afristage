# Start here

A fresh session reconstructs AfriStage from this repository, never from memory or
from the previous conversation. Six steps, in order.

1. **Verify you are in the canonical repository.**
   `~/projects/ai/afristage`, remote `Thepluscode/afristage`. Anywhere else: stop.

2. **Read `docs/PRODUCT_BUILDING_STANDARD.md`** — it is mandatory and governs
   every change here. It defines the required pre-implementation output and
   post-implementation report, and the definition of done. It is the single
   canonical copy; do not fork its text.

3. **Read `AGENT_CONTEXT.md`** — mission, the money authorities, the verification
   bar. Stable.

4. **Read `ACTIVE_WORK.yaml`** — the authorised current task, what is blocked,
   what is parked. This file decides what you work on.

5. **Run preflight and refresh state.** `~/.claude/scripts/preflight .` exits
   non-zero rather than warning. `npm run project-state` writes
   `PROJECT_STATE.json`; every count and SHA comes from there, never from memory.

6. **Act only on the task `ACTIVE_WORK.yaml` names.**

The durable engineering invariants — API error conventions, the money rules, the
status vocabulary, the repository facts an agent needs — are in
`CLAUDE-INVARIANTS.md`. They are not repeated here.

## The three rules this file exists to enforce

**Discovery is not authorisation.** The most recently discussed defect, feature
or idea does **not** become the current task. Park it in `PARKING_LOT.md` and
carry on with what `ACTIVE_WORK.yaml` says.

Changing the active task requires `FOUNDER_OVERRIDE`, `CURRENT_TASK_COMPLETED`,
`RELEASE_CONDITION_MET`, or a verified `P0`/`P1` interrupt — and the switch
records its reason. See `~/.claude/rules/rule-precedence.md` §B.

**This repository moves real money.** Coins are bought, gifts convert to creator
earnings, earnings pay out in fiat. Only `MoneyService` may post to the ledger,
every idempotency key is minted in one file, and a spend balance must never go
negative. `AGENT_CONTEXT.md` tabulates the boundaries and where each lives.

**A green check is not CI.** The checks that appear on `main` are often the
scheduled `synthetic-check` probe, a different workflow. `API CI` and
`Web & Mobile CI` run on every PR and on `main`; never report CI as healthy
without naming which of them you read.
