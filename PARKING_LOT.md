# Parking lot

Discovered, not authorised. Nothing here is the current task — `ACTIVE_WORK.yaml`
decides that, and discovery is not authorisation.

An entry earns a place by naming **what would make it the task**. An item with no
such condition is an opinion, and belongs in a commit message or nowhere.

Product decisions already gated in `ACTIVE_WORK.yaml` under `parked:` — self-serve
KYC, global payouts Phase B, payout rate pricing, web payout requests — are not
repeated here.

---

## P6 — observed while migrating continuity, 2026-09-21

### `CLAUDE-INVARIANTS.md` says 33 `NotFoundException` throws; there are 68

Not a defect — more 404s is the convention being applied more widely, which is
the desired direction. It is recorded because it is a **documented count inside
an instruction file**, and a documented count is stale the moment the code moves.
The continuity check asserts a floor of 30 rather than equality, precisely so a
correct change cannot fail it.

**Becomes the task when:** someone edits that section anyway. Then replace the
number with the convention, and let `PROJECT_STATE.json` carry the count.

### The same file says the company doctrine has 12 engineering rules; it has 13

Already corrected in the working tree as an uncommitted one-word change. Noted
here only so the correction is not lost if that change is discarded.

**Becomes the task when:** the uncommitted work is committed or dropped.

### Roughly thirty screenshot captures sit untracked at the repository root

`afri-*.png`, `afristage-*.png/jpg`, `qa-*.png`, `sw-desktop-scene1.png`,
`flutter-web-render.png` and others, alongside `mobile-captures/` and
`council-out/`. They are design-QA output from in-flight work, not assets the
product loads.

**Becomes the task when:** the admin-web/ScrollWorld work is committed or
abandoned. At that point they either belong in `docs/design/` with the pass they
evidence, or in `.gitignore`. Deciding for their author now would discard work
nobody has classified.

### Distribution is the binding constraint, and no amount of engineering moves it

Android release signing is verified, fastlane is scaffolded, and the AAB builds
with the correct upload certificate. None of it ships without a Play Console
account, a real upload keystore and a service-account JSON — and iOS additionally
needs a Mac. The hosted flutter-web service is the interim channel.

This is recorded in the parking lot rather than the backlog because **it is not a
task**: there is nothing an agent can do to advance it. It is here so a future
session recognises it as the constraint rather than rediscovering it as a bug.

**Becomes the task when:** the owner creates the accounts and drops in the keys.
`docs/mobile-release.md` is the runbook from that point.
