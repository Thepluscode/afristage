# AfriStage — Feature Tracker

Lifecycle, per [docs/PRODUCT_BUILDING_STANDARD.md](docs/PRODUCT_BUILDING_STANDARD.md):

`PLANNED` → `SCAFFOLDED` → `IMPLEMENTED` → `VERIFIED` → `PILOT-READY` → `PRODUCTION-READY`

- `PLANNED` — documented, not implemented.
- `SCAFFOLDED` — structure exists, behaviour incomplete.
- `IMPLEMENTED` — code exists, runtime verification incomplete.
- `VERIFIED` — automated tests **and** runtime evidence prove the workflow.
- `PILOT-READY` — deployable for controlled external use.
- `PRODUCTION-READY` — operational, security, recovery and scale requirements proven.

Never label something `VERIFIED` without evidence. Build/tests passing alone is
`IMPLEMENTED`.

## Reading the entries below this line

Entries written before 2026-07-28 use the previous vocabulary
(`PLANNED` → `IN PROGRESS` → `DEPLOYED` → `VERIFIED`) and have **not** been
relabelled. They were assessed against the definitions in force when their
evidence was gathered; rewriting the labels now would imply a re-audit that did
not happen. Read them through this mapping:

| Historical label | Meant | Nearest current label |
|---|---|---|
| `IN PROGRESS` | being worked on | `SCAFFOLDED` |
| `DEPLOYED` | tests pass, production evidence outstanding | `IMPLEMENTED` (some qualify as `VERIFIED` — check the entry's own evidence) |
| `VERIFIED` | **production** evidence observed | `VERIFIED` or stronger — the old bar was stricter than the current one |

The old `VERIFIED` required production evidence, which is a higher bar than the
current `VERIFIED` (tests plus runtime evidence). Historical `VERIFIED` entries
therefore do not overstate anything. Historical `DEPLOYED` entries are the ones
to re-check before treating them as proven.

New entries from 2026-07-28 use the current vocabulary.

Monorepo: NestJS+Prisma API (`apps/api`), Next.js admin (`apps/admin-web`),
Flutter mobile (`apps/mobile`).

---

## Session 2026-07-28 — reference gaps closed, and the API half they needed

| Feature | Status | Evidence |
|---------|--------|----------|
| The eight elements the 2026-07-26 audit listed as NOT BUILT: verified badge, viewer overflow action, Activity tab, top balance/top-up and Go Live controls, standalone Send Gift row, recommendation rail, per-room gift totals, creator Request Payout action. Plus the `/site` exposure and typography pass. | IMPLEMENTED | 353 mobile tests, `flutter analyze` clean, admin-web landing tests 7/7 and an optimized Next build; captures regenerated in `mobile-captures/`. No device or deployed evidence yet, so not VERIFIED. |
| **The feed never returned the gift total the cards display.** `giftCoinTotal` was read by the mobile model, but `FeedEngine` only computed gift coins internally as a 10-minute velocity input to ranking — every live card would have rendered "0 gifts" while people were gifting into the room. The feed now returns the room's own take as a separate unwindowed aggregate (the velocity window answers a different question and must not be shared), fetched even for a single-room slice, which previously short-circuited all aggregation — during the beta one live room is the common case. | VERIFIED | Live against real Postgres: feed reads `giftCoinTotal=0` for four seeded rooms, a 37 × 10-coin gift goes to one, and that room reads **370** while the other three stay 0. 820/820 API tests; **100% lines and branches** on `feed-engine.service.ts`, including the single-room path, the cache round-trip, and that the total and velocity queries stay separate. |

---

## Session 2026-07-27 — concurrent-write audit: last-write-wins removed where it lost data

Audited every write in `apps/api` for the lost-update pattern (read → validate →
write, with no guard that the row is still what was read). Conflict strategy is
now explicit per surface rather than accidental:

| Surface | Strategy | Why |
|---------|----------|-----|
| Money moves (gifts, purchases, payouts, chargebacks) | **Event-sourced** — immutable `LedgerTransaction` + entries; balances are derived and maintained by row-locked atomic `increment` | Already the design; conflicts are impossible rather than resolved |
| **`CreatorProfile` — the one genuinely two-editor document** | **Split by ownership** + compare-and-set + an append-only event log | Applicant owns the text, reviewer owns the decision; saving it as one object let the applicant destroy the reviewer's work |
| Payout / support / invite **state machines** | **Compare-and-set** | The losing writer must be told, not silently overwritten |
| Profiles (`Profile`), settings, display fields | **Last-write-wins** (unchanged) | Single owner, no cross-field invariant — LWW is correct here |
| Collaborative text / shared arrays | n/a | No such surface exists in AfriStage; no CRDT/OT layer is warranted |

### The actual data-loss machine: `CreatorProfile`

One row, **two independent editors**. The applicant writes it through
`creators.apply()`; an admin writes the review decision through
`approve/reject/suspend`. `ApplyCreatorDto` requires all four application fields,
so `apply()` was a whole-object save — and it also wrote
`approvalStatus: PENDING, rejectionReason: null` unconditionally. Reproduced
against real Postgres **before** the fix:

```
A. Admin approves the application, applicant then saves an edited form
  after admin approves : approvalStatus=APPROVED reviewedBy=set stageName=Ada      userRole=CREATOR
  after applicant saves: approvalStatus=PENDING  reviewedBy=set stageName=Ada Live userRole=CREATOR
  >> admin's approval vanished: true
  >> row still credits a reviewer for a decision that no longer exists: true

B. Admin suspends the creator, creator re-submits the same form
  after admin suspends     : approvalStatus=SUSPENDED
  after creator re-submits : approvalStatus=PENDING
  >> suspension cleared by the creator's own save: true

C. Both save at the same instant
  >> one of the two writes was silently discarded: true
```

Scenario A is the textbook lost update: the admin saves, the applicant saves, the
admin's decision is gone — and because `approveCreator` also sets `role=CREATOR`,
the user was left a full CREATOR whose application reads PENDING, with
`reviewedById` still pointing at a decision that no longer exists. **B is a
privilege bug, not just data loss**: a suspended creator cleared their own
suspension by re-submitting the form.

**The fix is ownership, not locking.** The row is now written in two disjoint
field groups: application text (single owner → LWW, kept) and the decision
(shared, and `APPROVED`/`PENDING` do not merge → the applicant never writes it
except via an explicit legal re-application; a rejected applicant re-applying
reopens review *and* clears the stale reviewer; a suspended one is refused).
Each save is conditional on the decision it was computed against, and both
editors now append to the same audit log — previously only admin actions were
recorded, so a status that changed under a reviewer's feet could not be explained
afterwards. Same script, after:

```
A. >> admin's approval vanished: false        (APPROVED kept AND stageName=Ada Live saved)
B. >> suspension cleared by the creator's own save: false
      refused with: ForbiddenException: Your creator account is suspended
C. >> a write was discarded: false            (both landed — disjoint field groups don't collide)
D. Two reviewers decide at the same instant -> 1 of 2 applied
      loser got: ConflictException: This application changed since you opened it
```

C is the point: once the document is split by ownership, simultaneous saves
*merge* and no one needs to be told anything. The compare-and-set only fires for
the residual case (D) where two writers genuinely contest the same field group.

**Residual limitation, stated plainly:** `expectedStatus` is forwarded from the
admin endpoints but `apps/admin-web` does not send it yet, so reviewer-vs-reviewer
is still last-write-wins in production until that client change ships. That is
tolerable where applicant-vs-reviewer was not — both racers are privileged, both
outcomes are legitimate admin decisions, and the audit log now records both.
Reviewing an application whose *text* changed after it was opened also still needs
that client token.

| Feature | Severity | Status | Evidence |
|---------|----------|--------|----------|
| **Payout review was a money-loss race.** `hold`/`release`/`approve`/`reject`/`markPaid` each read the payout, validated the transition against that stale copy, then wrote unconditionally. Two reviewers acting at once both passed `assertTransition`: approve + reject on one `UNDER_REVIEW` payout returned the coins to `EARNING` **and** left the row `APPROVED`, so a later `markPaid` drained an already-empty `PAYOUT_HOLD` (a `drain` source, deliberately unguarded) and paid a creator who had already been made whole. Now a single `claim()` helper makes the write conditional on the status that was validated (`where: { id, status: before.status }`) — the loser gets a 409. The claim is taken **before** the money move, so a losing reviewer never reaches the ledger, and is released if the move fails so the payout is retryable rather than stranded mid-state. | CRITICAL | DEPLOYED | 7 new specs: the `where` carries the guard; a lost race raises `ConflictException`; a lost reject and a lost `markPaid` each post **zero** ledger transactions; a failed money move restores the prior status; a non-race DB error is rethrown untouched; a missing payout is still 404. 64/64 payouts+support tests. |
| **Support tickets: the plainest lost update.** `assign()` overwrote `assignedAdminId` unconditionally, so the second admin's click silently took a ticket the first was already working — both believed it was theirs. Now conditional on the ticket being unassigned (or already yours, so re-claiming stays a no-op success); a real collision is a 409. | HIGH | DEPLOYED | Specs assert the guard clause, the second admin's conflict, self-reclaim success, and that a missing ticket is still 404 rather than a conflict. |
| **`CreatorProfile` lost update** (detailed above): applicant's whole-object save destroyed the reviewer's decision; suspended creators cleared their own suspension by re-submitting. | CRITICAL | DEPLOYED | Four-scenario before/after reproduction against real Postgres (output above); 27/27 creators tests incl. 11 new specs pinning the ownership boundary; **100% lines and branches** on `creators.service.ts` and `admin.controller.ts`. |
| **Beta invites: one code, two accounts.** Concurrent redemptions of the same code both found it `PENDING` and both wrote; the second overwrote `acceptedById`, erasing the first redeemer and admitting two accounts on one invite. Redemption is now conditional on `status: PENDING`; the loser gets the standard "already-used" rejection. | HIGH | DEPLOYED | 17/17 beta tests, incl. a new concurrent-redemption spec. |

**Live proof against real Postgres** (compose `postgres:16` on :5440, real
`PrismaService`, real rows, money service stubbed to count disbursements — mocked
Prisma proves the wiring but not that Prisma actually rejects a stale
compare-and-set, which is the assumption everything else rests on):

```
concurrent approve+reject  -> winners=1 conflicts=1 finalStatus=APPROVED
money moves posted=0       (the losing reject never returned the coins)
concurrent markPaid x2     -> winners=1 disbursements=1 ref=REF-A
CONTROL (unconditional write, both reviewers validated UNDER_REVIEW)
                           -> winners=2   <- the pre-fix double-write, reproduced
```

The control is the before-measurement: with the old unconditional write both
reviewers' writes land on a row they had each validated as `UNDER_REVIEW`, which
is exactly the state that let a returned-to-earnings payout still read `APPROVED`.
`800/800` API tests; **100% lines and branches** on all three changed services.
A non-`P2025` failure was also observed propagating untouched (an FK violation
from the harness itself surfaced as-is rather than being mislabelled a conflict).

**Caught in review of the above, before merge:** taking the claim before the
money move fixed the race but broke crash-recovery for `markPaid`. `PAID` is
terminal, so a process death between claiming `PAID` and posting the transfer
left a row reading `PAID` with the coins still in `PAYOUT_HOLD` and no legal
transition to retry from — where the old ordering had been self-healing (crash
left `APPROVED`, and the retry's idempotency key made the re-post a no-op).
Disbursement is now two-phase through the `PROCESSING` state the transition table
already anticipated: claim `PROCESSING` (that claim is what excludes the second
reviewer), post the transfer, then `PROCESSING -> PAID`. A crash leaves
`PROCESSING`, which resumes. Live-verified: `concurrent markPaid x2 -> winners=1
conflicts=1 disbursements=1 final=PAID`, `resume from PROCESSING -> final=PAID
disbursements=1`, `markPaid on a PAID payout -> ConflictException
disbursements=0`. `reject` keeps the same crash window (`REJECTED` is terminal
with no in-flight state) but in the safer direction — stuck coins rather than
coins returned to a creator who can request them again; documented in the code
with the upgrade path.

Left alone deliberately: `payments.creditCoins` has the same read-then-write
shape, but the ledger's idempotency key is scoped to the intent, so a webhook +
pull-verify + sweep racing cannot double-credit — the status write is the only
thing that can be redundant, and a redundant `SUCCEEDED → SUCCEEDED` loses
nothing.
## Session 2026-07-26 — admin + mobile aligned to the supplied Mission Control / mobile mockups

| Feature | Status | Evidence |
|---------|--------|----------|
| Admin dashboard rebuilt as "Mission Control" against the supplied reference: per-metric accent icon chips (teal/purple/gold/danger/green), day-over-day trend deltas with in-card area micro-charts, compact icon+action alert strips, a real live-rooms table (initial thumb, category/status pills, live-pulse viewer count, reports, relative last-active), a quick-actions grid, sidebar pending-work count badges, and a sidebar system-status heartbeat | DEPLOYED | Live against the compose stack (`docker compose up -d api` + seeded DB, admin-web on :3210, logged in as `admin@afristage.local`): dark + light renders captured; row-alignment asserted in-browser (all 6 cells per row share one `getBoundingClientRect().top`); 390×844 stacks with no horizontal overflow. 372/372 admin tests; **100% lines and branches on all four changed files** (`app/page.tsx`, `app/admin-ui.tsx`, `app/chrome.tsx`, `app/Sparkline.tsx`); `tsc --noEmit` clean; optimized `next build` passes. Production verification pending. |
| Three defects found and fixed while building the above: (1) `.muted` on a `<td>` set `display:block`, dropping the cell out of its row so "Last active" rendered visually offset — now scoped with `td.muted{display:table-cell}`; (2) a failed optional live-rooms fetch left the table saying "Loading…" forever — now a distinct `'error'` state that states the failure; (3) gold link text measured **1.5:1** on the light-theme surface — every gold *text* affordance now drops to amber-700 | DEPLOYED | Contrast re-measured in-browser after the fix: `rgb(161,98,7)` on `rgb(245,246,248)` = **4.55:1** (WCAG AA for normal text). Each fix has a covering test. |
| Mobile: live-rail card LIVE/viewer pill collision fixed (they rendered as `LIV≗2.1K` at the 108px rail width — now one space-between row with scale-down pills), follower counts added under "Creators to watch" avatars, and section headers gained tappable gold "See all" affordances | DEPLOYED | `flutter analyze` clean; 341/341 mobile tests including a new regression test asserting `livePill.right ≤ viewerPill.left`, both pills inside the card, and zero `RenderFlex` overflow at width 108. The same overflow was silently failing `beta_flow_test.dart > feed renders gift wallet quick actions from home mockup`, which now passes. Re-captured `mobile-captures/home.png` shows the corrected rail. Device/production verification pending. |

### Follow-up — mobile gift sheet + live-room chat overlay

| Feature | Status | Evidence |
|---------|--------|----------|
| Gift catalogue tiles render **emoji artwork** (🌹🔥🎤🥁👑🔦⭐🎪) per the mockup instead of the monochrome Cupertino icon set. Configured raster `artworkUrl` still wins; emoji is the fallback, including on image-load error. `afriGiftIcon` is now unreachable and was deleted with its test. | DEPLOYED | `afriGiftEmoji` unit-tested over all 22 name branches + case-insensitivity + empty-string; drawer widget test asserts the 🔦 glyph for "Spotlight". **Emoji glyph rendering is NOT visually verified** — see the capture limitation below. |
| Chat overlay rebuilt to the mockup: normal messages use a two-line layout (coloured name above the message, shadowed for legibility over video) instead of an inline `name text` run; gift events render as a teal→purple gradient pill — `<sender> sent <Gift> 🌹` with an `xN` multiplier chip that is hidden at quantity 1 | DEPLOYED | `mobile-captures/live-room-chat.png` (new capture, drawer removed — the old one hid the whole overlay behind the gift sheet). Widget tests assert the sender sits entirely above the message (`name.bottom ≤ body.top`, left-aligned), the gift row's sender/gift/emoji/`x5`, and that `x1`/null-quantity render no chip. |
| Chat input matches the mockup: one rounded "Say something…" field with the reaction picker *inside* it, one purple round send button, and the gift moved out to a floating FAB above the bar — down from four competing round buttons | DEPLOYED | Widget tests tap `Send gift` / `Send message` by semantics label and assert the disabled path cannot send. Visible in the new capture. |
| Reactions rise up the right edge of the stage (deterministic per-slot drift/size/fade) instead of sitting pinned in a static two-column grid | DEPLOYED | Capture taken **mid-flight** (`settle: false`) — `pumpAndSettle` runs the tween to its faded-out end, so the previous helper could never show them. Tests assert upward travel, the 6-glyph cap, the empty-room no-op, that `pumpAndSettle` terminates, and that `disableAnimations` mounts no tween at all. |
| API: `gift.sent` now carries `senderName` (nullable) alongside `senderId` | DEPLOYED | The mobile gift row cannot name the sender otherwise, and the payload only had an opaque id. Additive field on the typed `RoomEvents` contract; `validateSend` already loaded the viewer, so this is one `include: { profile: true }`. 776/776 API tests, including new specs for the populated name and the null-profile case. Client falls back to "Someone" for null/blank — asserted, along with never surfacing the raw id. |

**Capture-harness limitation (affects the two captures above):** emoji render as tofu boxes in `mobile-captures/*.png`. Flutter's test renderer uses only fonts registered via `FontLoader`, which cannot supply a colour-emoji font (`Apple Color Emoji.ttc` is a CBDT/sbix collection — it loads but registers no usable glyphs). Device font fallback handles this normally. A Flutter **web** build was made to try to prove it in CanvasKit, but reaching the gift sheet needs a logged-in session against a LIVE room and the local Docker image store has corrupted blobs (I/O errors on `postgres:16` and `afristage-api`), so the stack could not be restarted. **Emoji glyph rendering therefore remains unverified and needs device evidence.**

### Follow-up 2 — the four Docker-free reference gaps

| Feature | Status | Evidence |
|---------|--------|----------|
| Dashboard queue is now a **tabbed panel** (Live Rooms / Reports / Payouts) per the reference, each with its own columns and "Open all →" deep link. Switching tabs clears the status filter, since status values are per-queue and a carried-over value would silently empty the table. | DEPLOYED | 387/387 admin tests; a test drives all three tabs, asserts the filter reset and that "Open all" follows the active tab. |
| **Filter row**: category (rooms only) + status, both populated from the data actually present so a filter can never offer a value matching nothing; a "Showing N of M" count; and **CSV Export** of every filtered row (not just the six previewed). | DEPLOYED | `lib/csv.ts` is RFC-4180 quoted and unit-tested for commas, embedded quotes, newlines, CR and null/undefined. Export tests assert 9 rows exported vs 6 rendered, per-tab headers, every name fallback, and that the object URL is revoked. Export is disabled at zero rows. |
| **Per-room revenue** column, plus a real report count. `admin.liveRooms()` now returns `giftCoins` (a COIN sum via one `groupBy` over the listed rooms, not a query per row) and `reportsCount` (relation `_count`). | DEPLOYED | 781/781 API tests, incl. the empty-list short-circuit, the null-sum-to-zero case, and that the raw `_count` shape is not leaked to clients. |
| **Trend deltas widened honestly.** Added `newRooms` / `newCreators` to the daily series and gave the flow cards real deltas. | DEPLOYED | 781/781 API tests incl. UTC-day bucketing and out-of-window exclusion for both new fields. A dashboard test asserts exactly four cards carry a delta and that each backlog counter carries none. |

**Bug found and fixed:** `admin.liveRooms()` never returned `reportsCount`, yet the Live Rooms page and the dashboard table both read it — so **every room has displayed 0 reports**, the "reported rooms first" ordering was a no-op, and the "Reported live rooms are prioritised" banner never fired. Now returned and covered.

**A dishonest metric I introduced in the previous pass and have corrected:** the "Gift volume" card showed the *all-time gross* with a *day-over-day* delta attached — two different quantities in one card. It is now "Gift volume today" (the daily flow) with the gross as its caption; all-time still shows in Live economy.

**Why the other six cards have no trend:** a "vs yesterday" delta only means something for a flow. Open reports, pending payouts, open support and failed payments are point-in-time backlogs — a delta on them would read as a rate and mislead. Only rooms opened, creators joined, gift volume and new users are flows, and only those four carry deltas.

---

## Production-readiness audit: error handling / env separation / audit trail (2026-07-26)

Audited against the three gaps most commonly found in AI-assisted apps. Two of the
three were **already closed** here; claiming otherwise would have been theatre.

| Gap | Verdict |
|---|---|
| **1. Error handling beyond the default** | **REAL GAP — now fixed.** Data-fetch failures were already handled well (`ErrorState`, loading and empty states, per-widget catch + warn). But neither Next app had `error.tsx`, `global-error.tsx` or `not-found.tsx`, so any *render* crash produced Next's bare "Application error: a client-side exception has occurred" — a white screen with no context and no way back. |
| **2. Environment separation** | **MOSTLY ALREADY CLOSED — one real hole, now fixed.** `src/config/validate-env.ts` already refuses to boot production with missing/placeholder secrets, `ENABLE_MOCK_PAYMENTS=true`, `REQUIRE_ADMIN_MFA` off, or seeded-demo login enabled. The hole was `prisma/seed.ts`: no guard at all, so `npm run seed` against a production `DATABASE_URL` would upsert a SUPER_ADMIN **with a published password** plus demo viewers, creators and fake live rooms straight into the customer tables — and being an upsert, a re-run would silently succeed. |
| **3. Audit trail on sensitive actions** | **ALREADY CLOSED — no change needed.** `adminAuditLog` is written on admin login, session revoke (single and all), password-reset issue and request, creator approve/reject (which is the only role mutation that exists), room end, chat moderation, moderation actions, payout decisions, and account soft/hard delete. There is no email-change or admin-role-assignment endpoint, so there is nothing unlogged to catch. Requests also already carry a correlation id (`x-request-id` returned on every response) with structured completion logging via `RequestLoggingInterceptor` + `JsonLogger`. |

### What changed

| Feature | Status | Evidence |
|---------|--------|----------|
| Route-level error boundaries in **admin-web** (`error.tsx`, `global-error.tsx`, `not-found.tsx`) and **web** (`error.tsx`, `not-found.tsx`). Each states what happened, confirms nothing was lost, offers retry plus a way back, and surfaces Next's `digest` as a support reference. The raw error is logged to console but never rendered. `global-error.tsx` renders its own `<html>/<body>` with inline styles, since a root-layout crash may mean the stylesheet never loaded. | DEPLOYED | admin 413/413, web 37/37, **100% lines and branches** on all boundary files. Tests assert the raw message is not rendered, the digest is, both recovery paths work, and the no-digest branch omits the reference line. Both production builds pass. |
| **Seed production guard** (`src/config/seed-guard.ts`). Two independent signals: `NODE_ENV=production`, and the `DATABASE_URL` host against a local allow-list — because a local `NODE_ENV` with a copy-pasted production URL is the realistic accident, and only the host check catches that. Refuses rather than guessing when the URL is missing or unparseable. `ALLOW_DESTRUCTIVE_SEED=true` is the deliberate override. | DEPLOYED | API 788/788, 7 guard specs covering local hosts, production `NODE_ENV`, a remote host, the unparseable case, the override, and near-miss override values (`1`/`yes`/`TRUE` do **not** count). **Verified end to end:** running the real seed with a simulated Railway URL aborts with `Refusing to seed: DATABASE_URL points at "shortline.proxy.rlwy.net"…` before any write. |

**Deliberately not done:** a global Nest exception filter. Nest already returns JSON
(not stack traces) in production, and correlation ids plus structured error logging
are already in place, so a filter would only normalise the envelope — not close a
gap. Adding one would change every endpoint's error contract for no safety gain.

---

## Reference-vs-built inventory (audited 2026-07-26)

> **Closed 2026-07-28** by "Reference gaps closed" below. The NOT BUILT rows in
> this section are preserved as the audit found them — the audit is a
> point-in-time record, not a live checklist.

Earlier sessions listed exclusions ad-hoc — whatever happened to be noticed while
building. That under-reported the gap. This is a full element-by-element pass over
all five supplied reference images. **Status is what is actually in the codebase**,
not what was intended.

### Reference A — mobile 4-up (home / live room + gift sheet / creator dashboard / wallet)

| Element | Status |
|---|---|
| Hero live card: cover, Live-now pill, viewer pill, title, "With <creator>", Join now, carousel dots | BUILT |
| "Live now" rail: LIVE + viewer pills, category chip, title, creator · country | BUILT |
| Section headers with gold "See all" | BUILT |
| Category chip row | BUILT |
| "Creators to watch" ring rail with follower counts | BUILT |
| Live room: top bar (chevron, avatar, name, Follow, viewers), LIVE/category/language tags | BUILT |
| Live room: chat overlay (two-line messages), gift row with `xN`, rising reactions, chat input + gift FAB | BUILT |
| Gift sheet: 2×4 grid, emoji artwork, coin prices, selected state, balance pill, Send bar | BUILT |
| Creator dashboard: approved banner, Overview stat grid, Earnings + Payout, Top supporters, Go Live | BUILT |
| Wallet: balance card, currency selector, Payout/Transactions, Earnings summary, settings rows | BUILT |
| **Verified ✓ badge beside the creator name in the live-room top bar** | **NOT BUILT** — `AfriLiveTopBar` has no verified flag |
| **Bottom nav "Activity" tab** | **NOT BUILT** — the viewer's 4th tab is Wallet, not Activity; there is no activity/notification feed tab |
| **"..." room overflow menu for viewers** | **PARTIAL** — rendered only when `onReport` is passed, which `room_screen` does for hosts |

### Reference B — mobile home (coin balance / Send Gift / Live now / Recommended)

| Element | Status |
|---|---|
| Gift Wallet card with balance and Send Gift / Top Up / History actions | BUILT (sits at the **bottom** of home; the reference puts the balance at the **top**) |
| "Live now" rail + "See all" | BUILT |
| **Coin-balance header card with "Top up" at the top of home** | **NOT BUILT** — balance is only in the bottom panel and the app bar pill |
| **"Send Gift — Show love. Support creators." standalone row** | **NOT BUILT** — exists only as a small action tile |
| **"Recommended for you" rail** | **NOT BUILT** — home has Live now, Upcoming, Browse by category, Creators to watch; no recommendation rail |
| **Notification badge count on the home bell** | BUILT |

### Reference C — mobile home (Go Live CTA / gift counts / Gift Wallet)

| Element | Status |
|---|---|
| Gift Wallet card with balance | BUILT |
| "For You" rail | BUILT (as the "For You" category chip, not a separate rail) |
| **"Go Live" primary button + purple "+" at the top of home** | **NOT BUILT** — going live is only reachable from the bottom nav |
| **Gift totals on live cards (🎁 12.5K)** | **NOT BUILT** — `LiveRoom` carries no gift count; the API does not return one per room in the feed |
| **"Request Payout" as a home wallet action** | **NOT BUILT** — the third tile is Top Up |

### Reference D — admin "AfriStage Admin"

| Element | Status |
|---|---|
| Grouped sidebar with icons | BUILT |
| Topbar: search, theme toggle, notification badge, admin menu | BUILT |
| Critical-reports alert strip | BUILT |
| 4 KPI cards with icons | BUILT (8 cards) |
| Tabbed table (Reports / Payouts / Live Rooms) | BUILT |
| Ledger status card, Quick actions grid | BUILT |
| Per-row action buttons (Review / Escalate) | BUILT |
| **Dedicated "Payouts queue" card** (@handle · amount · status) | **NOT BUILT** — payouts are a tab instead |
| **Sidebar: Moderation, Settings** | **NOT BUILT** — no such routes exist |

### Reference E — admin "Mission Control"

| Element | Status |
|---|---|
| Sidebar count badges (Approvals 12, Reports 7) | BUILT |
| "System Status ● All Systems Operational" footer | BUILT |
| 3 alert strips with inline action buttons | BUILT |
| 4 KPI cards with sparkline + "% vs yesterday" | BUILT (4 flow cards; backlog cards deliberately have none) |
| Status / category filters + Export | BUILT |
| Table: category pill, status pill, live viewer dot, revenue, relative last-active | BUILT |
| **Date-range picker ("May 16 – May 22, 2025")** | **NOT BUILT** — needs server-side range support |
| **"All Countries" filter** | **NOT BUILT** — `country` is on the room record but not exposed as a filter |
| **"Filters" (advanced) button** | **NOT BUILT** |
| Pagination ("Showing 1 to 10 of N", elided page window) | BUILT |
| Per-row actions (Suspend / End on rooms, Review / Escalate on reports) | BUILT — no "⋮" overflow; payouts link out instead of mutating money here |
| **Room thumbnail photos in the table** | **NOT BUILT** — uses a lettered tile; no room cover reaches the admin API |
| **⌘K hint in the global search** | **NOT BUILT** — search works, the affordance is unlabelled |
| **Sidebar: Live Monitor, Approvals, Verifications, Categories, Tags, Transactions, Suspensions, Roles & Permissions, Settings** | **NOT BUILT** — none of these routes exist |

### Follow-up 3 — row actions + pagination

| Feature | Status | Evidence |
|---------|--------|----------|
| **Row actions.** Live Rooms rows get Suspend / End (confirmation dialog, disabled when the action cannot apply); Reports rows get Review / Escalate (reason prompt, falling back to the action name when blank). Both reuse the existing endpoints the per-resource pages already call, and refresh only the queue they touched. | DEPLOYED | 407/407 admin tests, **100% lines and branches** on all five changed files. Tests cover both mutations, the disabled states, the blank-reason fallback, and the failure surface. Failure path also **proven in a browser**: a rejected suspend rendered `Suspend failed: POST /admin/live-rooms/r3/suspend failed: 404` in a `role="alert"` instead of silently doing nothing. |
| **Pagination.** 10 rows per page with an elided page window (first + last always shown, ≤7 controls), prev/next disabled at the ends, `aria-current` on the active page, and "Showing X to Y of N". Page resets on tab and filter change, and clamps when the row count shrinks beneath it. | DEPLOYED | `pageWindow` unit-tested across the start/middle/end cases and for fixed width. Live check: 26 rooms → "Showing 1 to 10 of 26", page 3 → "21 to 26" with 6 rows, then filtering to 4 rooms returned to page 1 rather than stranding on an empty page. |

**Deliberate scope calls:**
- **Payout rows link out** to `/payouts?id=…` instead of carrying approve/reject. Moving money needs the ledger check, fraud score and destination masking that only the payouts page shows; a preview panel is the wrong place for it. A test asserts no approve/reject control exists on this surface.
- **No "⋮" overflow menu** — with two actions per row it would hide them behind a click for no gain.
- **Pagination is client-side** over the fetched rows. The admin API caps at 100 records, so when the fetch returns exactly 100 the panel now says "Showing the most recent 100 records — open the full page for older history", rather than letting "of 100" read as the whole dataset. True server-side paging would need `page`/`pageSize`/`total` on the admin endpoints and is not done.

**Not verified:** the row-action *success* path. The stub API used for the browser check has no mutation endpoints and Docker is still unusable, so only the failure path has live evidence; success is unit-tested only.

### Summary

- **Mobile:** the four reference screens are substantially built. 8 discrete elements are missing, mostly home-screen composition (top-of-page balance, Go Live CTA, Recommended rail, per-room gift totals) and two small live-room details.
- **Admin:** the dashboard shell matches. Row actions and pagination are now built (follow-up 3). **10 elements remain missing**: date-range and country filters, the advanced "Filters" button, room thumbnails, the ⌘K hint, a dedicated payouts-queue card, and **11 sidebar destinations that do not exist as routes** (Moderation, Settings, Live Monitor, Approvals, Verifications, Categories, Tags, Transactions, Suspensions, Roles & Permissions).

None of the NOT BUILT items above have been started. Several are non-trivial
(pagination and row actions need server-side paging and mutation wiring; the
sidebar destinations are whole features, not UI). They are listed here so the
gap is visible rather than discovered later.

**Still blocked on environment, not code:** live verification of everything in this session. The volume hit 100% (121Mi free of 228Gi), which corrupted Docker's containerd blob store; `docker system prune` cannot even enumerate images. ~3.9Gi has since been reclaimed, but recovery now needs a Docker Desktop disk reset, which destroys all local images and volumes — an operator decision, not taken. Emoji glyph rendering also still needs device evidence.

---

## Session 2026-07-21 — session timeout: return-to-path on re-auth

| Feature | Status | Evidence |
|---------|--------|----------|
| Admin re-auth returns operators to where they were, not the dashboard: `middleware` appends `?next=<path+query>` on the login redirect (omitted for root); `login` redirects there after success via a `safeNext()` open-redirect guard (same-origin relative paths only — blocks `//host`, `/\host`, absolute URLs, `/login` loops). Audit found the "15-min kick-out" premise false (both surfaces silently refresh the 15m access token — mobile `_refresh`-on-401, admin-proxy refresh-before-401) and a 60s warning low-value for a 30d-refresh model; only the return-path was a real gap. | VERIFIED | Live on `admin-web-production-803b`: unauthed `/users?status=OPEN` → `/login?next=%2Fusers%3Fstatus%3DOPEN` (path+query preserved), `/payouts` → `?next=%2Fpayouts`, `/` → `/login` (no `next`), `/site` 200 + `/login` 200 (no regression). admin-web 353 tests; the 3 changed files 100% incl. every open-redirect rejection case. PR #182. |

---

## Session 2026-07-21 — admin login placement

| Feature | Status | Evidence |
|---------|--------|----------|
| Responsive admin-login placement: horizontally centered, top-safe on tall browser viewports, fully visible on standard screens, and vertically scrollable on compact screens | DEPLOYED | Supplied crop reproduced at 856×1336 with the card starting at `y=452`; corrected browser render starts at `y=96` with the complete form visible. Checks at 390×844, 390×568, and 390×480 show zero horizontal overflow and a reachable scroll fallback. Focused login tests and optimized admin build passed. Production verification pending. |

---

## Session 2026-07-20 — user-facing interface refinement

| Feature | Status | Evidence |
|---------|--------|----------|
| Viewer + creator shared visual system aligned to the supplied five-screen goal interface: editorial typography, cinematic stage atmosphere, sculpted brand mark, elevated cards/stats, refined controls/dialogs/sheets, premium gold/purple role-aware bottom navigation, and redesigned authentication entry | IN PROGRESS | Reference: `Generated image 1 (4).png`; `flutter analyze` clean; 338/338 tests; four 390×844 rendered states compared. Second-pass QA compacted the creator overview/earnings/supporters into the target first viewport, matched the wallet header and density, preserved refresh with pull-to-refresh, and enabled configured gift artwork. Populated live-room and viewer-home photo rendering still require device evidence; see `design-qa.md`. |
| Public landing page aligned to the supplied cinematic goal interface: exact stage photography, black/gold editorial hero, live-room overlay, one consistent serif campaign type system, restrained editorial motion, four cinematic feature-card images, three offer-card story images, and conversion CTAs | DEPLOYED | References: `Generated image 1 (5).png` plus the supplied typography, feature-card, and offer-card crops; browser comparison confirms Georgia display type across every landing `h1`/`h2`/`h3`, all seven responsive card images load with deliberate focal crops, 856×1336 and 390×844 layouts have no horizontal overflow, offer actions anchor to the card base, scroll reveals and the process transition work, focused site tests pass, and the optimized Next.js build passes. Production verification still pending. |

---

## Session 2026-07-20 — admin interface refinement

| Feature | Status | Evidence |
|---------|--------|----------|
| Mission-control visual polish: stronger hierarchy, four-column operational metrics, refined alert/panel surfaces, active-navigation treatment, atmospheric texture, compact mobile header, and reduced-motion coverage. Browser QA caught and fixed a cascade-order regression that hid the mobile navigation trigger. | DEPLOYED | local authenticated browser: desktop dark/light, dashboard, users table/filter surface, 390px layout and drawer interaction clean with zero horizontal overflow; admin-web 342/342 tests; optimized Next.js build passed. Staging deployment pending explicit `EXECUTE`. |

---

## Session 2026-06-30 — apps/admin-web to 100% coverage

Stood up a test harness for the Next.js admin dashboard and took it to
**100% line / branch / function coverage (1832 / 1832 lines)**. **222 tests**,
all green; production build still passes. Status: `DEPLOYED` (vitest + RTL with
a mocked `lib/api`, `next/headers`, and `next/navigation` — not production
evidence).

Harness (new): **Vitest 2.1.9 + @vitejs/plugin-react + jsdom +
@testing-library/{react,user-event,jest-dom} + @vitest/coverage-v8** (provider
v8). `vitest.config.ts` (coverage `include` = `app/**`, `lib/**`, `middleware.ts`,
`all: true`), `test/setup.ts` (jest-dom, cleanup, `window.location` stub),
`test/` (25 files), `npm run test` / `test:coverage` scripts.

Coverage breakdown:
- **Server logic**: `lib/api.ts` (proxy paths, 401 redirect, error throw,
  logout), `middleware.ts` (auth/expiry/JWT-decode branches, `/login`
  redirects, stale-cookie clear), and the three route handlers — `auth/login`
  (401/500/403/200 + secure-https cookie), `auth/logout`, and `admin-proxy`
  (401 no-cookie, GET/POST/PATCH/DELETE forwarding with bearer token + body).
- **Shared components** (`app/admin-ui.tsx`): every exported component +
  `toneFor` branches, DataTable empty/rows, ConfirmDialog confirm/cancel,
  badge/cell fallbacks, panels (ledger-integrity ok/bad, payout blocked).
- **All ~21 client pages**: loading / error / success states + interactions
  (adminPost/adminPatch, `window.confirm`, filter-form submit, sort tiebreaks).
- `app/layout.tsx` (chrome mocked to a passthrough) + `app/chrome.tsx`
  (both `usePathname` branches).

Production edits (minimal, documented):
- `app/ledger-integrity/page.tsx`: one `/* v8 ignore next */` on the `?? []`
  guard at the `imbalanced.map` — genuinely unreachable (the `imbalanced`
  filter excludes any txn whose `entries` sum balances, so mapped txns always
  have a defined non-empty `entries`), but TS requires the guard since `entries`
  is optional in the type. Mirrors the mobile `coverage:ignore` precedent.

CI: added a `npm run test -w apps/admin-web` step to the `admin-web` job in
`.github/workflows/web-mobile-ci.yml` (runs before the production build).

Method: fanned the ~22 page/component targets across 3 parallel subagents over
disjoint file sets (core/shared, people/ops, money/system), each with an
isolated coverage report dir; then a unified pass closed the cross-file gaps
(`app/layout.tsx`, the `admin-proxy` PATCH export).

---

## Session 2026-06-29 → 2026-06-30 — apps/mobile to 100% coverage

Took the Flutter mobile app to **100.00% line coverage (3782 / 3782)**, up from
~80% at the start of the mobile work and 95% mid-session. **296 widget tests**,
all green; `flutter analyze` clean; `dart format` applied. Status: `DEPLOYED`
(flutter widget tests with faked ApiClient/socket/secure-storage — not
production evidence).

How the last ~5% was closed:
- **room_screen.dart 100%**: a `_FakeSocket` (captures `on(...)` handlers so
  tests fire server events) + a fail-configurable `_RoomApi` drove gift send
  (success / insufficient-coins / non-numeric earning / API failure), reactions,
  follow toggle + rollback, leaderboard (incl. failure), mute (host, success +
  failure), end-room failure, close/report/safety navigation, low-data toggle,
  and every socket event (mute-self, mute-other, ban-self, suspend, end).
- **afri_ui.dart 100%**: image `errorBuilder` fallbacks via a `https://fail/…`
  sentinel (the net mock 404s that host); `_title` switch exercised by rendering
  every `AfriRoomState` with a null message; end-room dialog confirm **and**
  cancel paths; `AfriLegalLinks` Terms/Privacy via a fake `UrlLauncherPlatform`;
  const-only constructors instantiated non-const (`UniqueKey`) so the
  constructor lines register runtime hits.

Test seams / production edits (documented, minimal):
- Added `debugRoomVideoBuilder` seam in room_screen.dart so the video panel is
  testable without a live WebRTC session.
- `livekit_room_view.dart` (irreducibly native WebRTC `Room`) and the
  `debugRoomVideoBuilder` default are wrapped in `// coverage:ignore` — no test
  seam exists without a device.
- Deleted dead code surfaced by coverage: the never-displayed `_buildVideoPanel`
  fallback `Stack` (AfriVideoStage renders its own waiting state), the
  `_sendMessage` muted/blocked/disconnected guards (the chat input is
  enable-gated, so they were unreachable), and the `_openCreator` null-hostId
  branch (the caller only passes non-null ids).

Real bugs fixed earlier this mobile run (kept): `setState(() => _x = <Future>)`
debug-assert in search/feed screens; creator_screen dialog
controller-dispose-during-exit-animation.

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

## Layer 10 — caching (2026-07-13)

Audit result: browser layer is framework-handled (Next.js hashed assets), CDN layer
correctly absent (all GETs auth-scoped/personalized; global `no-store` stands), app
layer already existed (feed slice cache). One deferred item promoted and shipped:

| Feature | Status | Evidence | PR |
|---------|--------|----------|----|
| Feed slice cache moved from per-instance memory to **Redis** (shared across instances); invalidation via atomic generation counter (`INCR feed:gen`); Redis outage degrades to fresh DB queries, never a feed error | DEPLOYED | 100% cov on changed files; live: fresh-vs-cached responses **byte-identical**, `feed:slice:0:*:*` TTL 10s, `feed:gen` nil→2 across real API start/end, feed 200 with Redis stopped + degrade/recover logs; `validate:ranking` 10/10, `validate:room-events` 9/9 | #162 |

## Account recovery (2026-07-13)

Closes the two auth gaps documented in the support playbook (PR #163):

| Feature | Status | Evidence | PR |
|---------|--------|----------|----|
| **Admin-issued password reset**: `POST /admin/users/:id/password-reset-token` (audited, one-time 256-bit token, sha256-stored, 15 min TTL) + public `POST /auth/password-reset/confirm` (non-enumerating, single-use, signs out everywhere). Self-service `request` endpoint deferred until an email/SMS provider exists | DEPLOYED | 100% cov on changed files; live 16/16: token issue→confirm→old password dead→new works, replay rejected, audit rows in SQL | #164 |
| **Admin MFA reset**: `POST /admin/users/:id/mfa-reset` — ROTATES secret + 8 recovery codes instead of disabling (avoids `REQUIRE_ADMIN_MFA` hard-lock), signs out everywhere, audited | DEPLOYED | live: real TOTP enrollment → rotate → old secret 401, new secret 201, MFA never dropped | #164 |

## Staging environment (2026-07-13) — the VERIFIED unblock

| Feature | Status | Evidence | PR |
|---------|--------|----------|----|
| **Railway staging**: api + Postgres + Redis at https://api-production-e12f.up.railway.app/api; migrations run pre-deploy; seeded passwords rotated to randoms (in Railway vars); mock payments on | VERIFIED | live 10/10 on the public URL: 3-role login → mock purchase (+100 coins exact) → room start → gift (−10 exact) → ranked feed → **ledger integrity OK** → recovery flow → room end; readiness `{db:true,redis:true}`; helmet+HSTS headers; synthetic check green from outside | #165 |
| Account recovery (PR #164) — staging evidence | VERIFIED | admin-issued reset token → confirm 201 on the deployed environment | #165 |
| Redis feed slice cache (PR #162) — staging evidence | VERIFIED | feed served twice on staging against Railway Redis; readiness redis:true | #165 |

| **admin-web on staging**: https://admin-web-production-803b.up.railway.app — Next.js proxy over the Railway private mesh (`api.railway.internal:8080`); own `/api/health`; deployed via per-service `RAILWAY_DOCKERFILE_PATH` | VERIFIED | live: UI login 200 with rotated admin creds, authed dashboard 200, ledger-integrity `ok:true` THROUGH the UI proxy, all 6 playbook pages (support/reports/payments/payouts/ledger-integrity/live-rooms) 200, unauthed → /login 307; admin-web vitest 323/323 | #166 |

| **Beta launch gate passed on staging** — `launch:beta:live` with `API_BASE`/`DATABASE_URL`/`SEED_*` pointed at Railway: docs gate, prod-readiness static, UX readiness, admin-web build, mobile analyze+tests, live health, beta validator 20/20, smoke test 36/36 | VERIFIED | `tmp/staging-gate-full.log`; gate scripts fixed en route (stale legacy payment bodies + pre-#29 gift quantity had 11 latent failures — identical locally, so staging itself was never at fault) | #167 |
| **Continuous monitoring**: cron every 5 min probes api + admin-web health from outside Railway (`tmp/synthetic-check.log`); webhook slot ready | VERIFIED | scheduled run wrote 2/2 healthy without manual invocation | #167 |
| `validate-ranking` idempotent: synthetic hosts carry marker emails (cleanup can't touch seeded creators) + feed GET uses the cache-bypass `?q=` path (SQL seeds never bump the slice generation) | VERIFIED | 3 consecutive green runs (was: crashed on 2nd run) | #167 |

| **Public waitlist live**: https://thepluscode.github.io/afristage/ form → staging `POST /beta/request` → admin beta-requests queue (was a mailto to an unmonitored inbox) | VERIFIED | real-browser submit on the PUBLIC gh-pages URL landed `{category:FAN, country:Ghana, status:PENDING}` on staging, read back via admin API; test rows deleted | #168 |

| **Email slot (dark until keyed)**: `EmailService` (Resend via raw fetch, `isConfigured()` pattern, best-effort — failures log + return false, never throw) wired into self-service `POST /auth/password-reset/request` (non-enumerating) and beta-invite code delivery; lights up with `RESEND_API_KEY` | DEPLOYED (dark) | 100% cov on changed files; API suite 677/677; live on staging: known + unknown email both `{ok:true}`, log shows token issued + "email skipped (no provider configured)" | #169 |

| **Mobile app ↔ staging verified**: debug APK built with `--dart-define=API_BASE=<staging>`, real login on the afri emulator with the ROTATED viewer password → home screen with live wallet balance (540 coins) + correct empty-feed state, all over the public internet | VERIFIED | `afri-mobile-staging-home.png`; staging log shows the app's `POST /auth/login` 201 + refresh-on-launch | #170 |
| **Request log lied on error paths** (severity: HIGH) — every 4xx/5xx logged the PRE-filter `res.statusCode` (a rejected login logged as `statusCode=201`). Cost a live debugging session. Status now taken from the thrown exception | VERIFIED | bad-password login against staging now logs `statusCode=401`; regression tests added; interceptor 100% cov | #170 |

| **Cinematic redesign shipped through the gate** (external tool authored; gate hardened): public `/site` on staging admin-web (auth-exempt, tested), photographic mobile UI, landing product reel. Gate caught: coverage 91.95%→100% restored (site test + 5 flutter tests, 330/330 + 327/327), unignored `build/` dir, 5.4MB PNGs→958KB JPEGs, false "running site" claim | VERIFIED | live: staging `/site` 200 unauthenticated + hero jpg 200, gh-pages reel + suite jpg 200, waitlist intact, prod render zero console errors (`site-live-render.png`). **Open: imagery provenance before marketing push** | #171 |

| **LiveKit Cloud wired + verified on staging**: API issues accepted tokens; the mobile app connects to LiveKit Cloud through the full product flow (login → Go Live → publish button) — participant visible server-side; real demo video publishes into app-created rooms | VERIFIED | `RoomServiceClient` shows the app participant + `demo-publisher` with 1 video track in the app's room; screenshots `tmp/lk-*.png`. Emulator camera capture fails (AVD limitation) — physical-device publish is the remaining wave-1 check | #172 |
| **Two launch-blocking mobile bugs found by the live drive**: (1) creator dashboard red-screen crash — `as num` casts on BigInt-string money fields (swept 24 call sites → tolerant `asInt`/`asNumOr` helpers); (2) the ONLY publish affordance scaled to invisibility on short host stages — host could not go live (button now in the controls panel) | VERIFIED | crash screen now renders real staging data ($16.00/7m); publish button tapped on-device → LiveKit participant appeared; 334/334 tests, changed files 100% | #172 |

| **Per-user activity view** (week-3 habit-gate step 1): `GET /admin/user-activity` (admin-gated, `?days=` 1..90 default 7) rolls up per-user last-active + windowed meaningful actions (rooms joined + gifts sent + mission claims; sessions count toward last-active only, never the tally). Admin page `/user-activity`, quietest-habitual first, QUIET/ACTIVE/NEW badges | VERIFIED | 100% cov changed files; API 682/682, admin-web 100%; live-to-the-row on compose: 1 room join + 1 gift → `weekActions:2 {rooms:1,gifts:1}` **matching SQL exactly**; clamp 100→90, unauth 401. Steps 2–3 (anomaly detection, auto re-engagement) deferred per premise gate (n≈8, email dark, no 3-week history) | #173 |
| **Security posture** (buyer-trust, adapted B2C): public `/site/security` page + `/.well-known/security.txt` (RFC 9116) + `security@afristage.live` disclosure + `docs/security-posture.md` audit scorecard; ran `security_sweep.sh` first (gitleaks hit = false positive; lodash CVEs = devDep-only absent from runtime; Next CVEs = unused code paths, staged not force-bumped) + fixed a silently-swallowed wallet re-sync (Rule 8) | VERIFIED | admin-web 100% + mobile 335/335 + analyze clean; live on staging: `/site/security` 200 + `security.txt` 200 unauth, admin `/security` STILL gated 307→/login (no regression), all 6 control claims present, deployed browser render clean (`security-page-deployed.png`) | #174 |
| **Account deletion + GDPR erasure lifecycle**: app had login but zero deletion path (no endpoints, no `onDelete`, no data report). New `account` module: self-service `DELETE /account` (password re-auth) + admin soft/hard/export; soft delete kills sessions + 30-day retention window; GDPR Art. 15 export; ordered hard delete erases PII to a **PII-free `User` tombstone** while RETAINING financials (wallet/ledger/payments/gifts/payouts — no `onDelete:Cascade` on purpose); daily `@Cron` 30-day sweep + `purgedAt` marker. Cascade map for all ~22 user-touching models in `docs/account-deletion.md` | VERIFIED (compose) | 100% cov on new files; API 705/705 (one load flake, green isolated); **live to the row**: export no `passwordHash` leak, wrong-pw 400, soft delete → sessions 0 + login 401, hard purge → PII null + **ledger count unchanged through erasure** + wallet intact, sweep erases expired / spares in-window / idempotent (1 audit row). Staging deploy pending (`migrate deploy` for `deleted_at`/`purged_at`) | #175 |

| **Interface polish pass** (mobile + admin + public site; audit-driven, 3 parallel review agents): completes #175's UX in both UIs (mobile Delete Account screen + admin per-row Delete/Purge/Export). Fixed a REAL bug — host Mic/Camera toggles only flipped a UI bool, so a "muted" host kept broadcasting; now wired to LiveKit `setMicrophoneEnabled`/`setCameraEnabled`. Removed dead UI (data-saver, low-data, Today/Export buttons, hardcoded fake payout/report/support columns); dropped credential prefill + `kDebugMode`-gated dev seed panels; consistent StatusBadges; /site creator-facing metadata + OG cards + mobile/a11y fixes; landing OG cards + waitlist role bug | VERIFIED (tests) | mobile analyze clean + 336 widget tests; admin-web 342 vitest 100% cov; admin console browser-rendered clean. **Mobile emulator render blocked (196MB APK install fails) — tests substitute, per agreed approach.** Not deployed | #176 |

| **Payment reliability: lost-webhook reconciliation + double-charge guard**: coins were credited only by webhook/on-demand verify — a lost webhook left the customer PAID with no coins, undetected. Added `reconcilePending` + 5-min `@Cron` that verifies stale PENDING card intents against the provider and credits via the SAME idempotent path (no double-credit), marking >24h-unpaid FAILED. Plus a double-charge guard: persist `checkoutUrl`, resume the same checkout on a repeat buy within 10min instead of a second charge | VERIFIED (tests + live scope) | payments.service.ts 100% cov (+13 tests: credit-once, abandon→FAILED, idempotent ledger, dedupe-resume, cron paths); API 718/718; live: API boots w/ cron+migration, `/payments/me` 200 (Prisma reads checkout_url), sweep+dedupe WHERE select exactly the right rows. Full card E2E needs real provider keys (absent in compose). **Staging deploy pending** (`migrate deploy` for `checkout_url`) | #177 |

| **Staging deploy of #175 + #176 + #177** (Railway, `railway up --service api/admin-web`): preDeploy `migrate deploy` applied all 3 new migrations (`deleted_at`, `purged_at`, `checkout_url`) — logs show "All migrations successfully applied"; api boots clean, reconcile `@Cron` registered | VERIFIED (staging) | live E2E on `api-production-e12f`: register→export (no passwordHash leak)→wrong-pw 400→self-delete `{ok:true}`→login 401; admin operator flow driven end-to-end with a real SUPER_ADMIN (throwaway, cleaned up): soft-delete 201→export (no passwordHash leak, wallets incl.)→hard-purge `{ok:true}`→post-purge email null + profile "Deleted user"→purge-expired idempotent; role gate proven (403 VIEWER→201 SUPER_ADMIN); admin-web `/users` rendered the purged victim as a "Deleted user"/DELETED tombstone with the Export/Delete/Purge action buttons live. `admin-web-production-803b` `/site` tab now "AfriStage — Africa's live stage for creators" (+og:title), `/site`+`/site/security`+`security.txt` 200, `/users` gated 307. Mobile app (store-deployed, N/A here). Landing OG/Twitter cards + waitlist role fix pushed to gh-pages (`a2f4afb`) + verified live on `thepluscode.github.io/afristage` (og:title + twitter:card + e.submitter present, 200) | #175/#176/#177 |

| **Dead-code audit + repeatable knip gate** (against "delete what you don't use"): premise didn't hold — code is domain-named, not generic. Removed 6 genuinely-dead deps: api `passport`+`passport-jwt`+`@nestjs/passport`+`@types/passport-jwt` (auth is a custom `JwtAuthGuard` over `@nestjs/jwt`; passport nowhere in src) + `@nestjs/testing`; admin-web `@testing-library/user-event`. Added `npm run deadcode` (knip) gate to both TS apps (tuned to real signal). Wired the one orphaned screen (`GiftHistoryScreen`, "Gifts sent") into Profile instead of deleting | VERIFIED | api deadcode green + tsc + 718 tests + **rebuilt container boots & JWT auth works live** (token→200/no-token→401 = passport removal safe); admin-web deadcode green + 342; mobile analyze clean + 336, orphan screen now reachable. **Deployed to staging + verified**: running container has NO passport/`@nestjs/passport` in node_modules (new build rolled, `npm ci` succeeded without them), auth works live (register→token, JWT-gated→200, no-token→401, login→201) | #178/#179 |

| **API data-exposure regression guard + contract** (against "API returns everything / sequential IDs / no versioning"): audit found the opposite — all 37 ids are UUIDs (no enumeration), credentials stripped by a global Prisma `omit`, cross-user reads whitelist public profile fields, no raw `include:{user:true}`, email/phone only on `/users/me`. Locked it in: extracted `GLOBAL_USER_OMIT`, `api-exposure.guard.spec.ts` (fails on credential drop / PUBLIC_HOST_INCLUDE leak / profilesFor PII / cross-user endpoint email leak), `docs/api-exposure.md` contract. Versioning deferred (Rule 0 — first-party lockstep clients; trigger = first external integrator) | VERIFIED | negative-tested (email:true in PUBLIC_HOST_INCLUDE → guard fails); 722 tests (+4), prisma.service.ts 100% | #180 |

| **Disaster-recovery runbook + runnable restore verification** (the one ops layer not written down; hit a real DB-wipe this session): `docs/disaster-recovery.md` (verify Railway managed backups ON — CLI only shows redis-volume so don't assume; restore paths for snapshot/total-loss/corruption; the `railway ssh --service api` DB-routing gotcha) + `scripts/verify-restore.sh` (health→ready→ledger-integrity→login; a restore isn't done until it passes) | VERIFIED | verify-restore green on compose (all 4) + staging (health/ready); negative-tested exit-1 on down service | #181 |

| **Dispute/chargeback capture** (against "your first dispute freezes your Stripe account"): a dispute webhook parsed to `null` and was ignored — funds clawed back, ledger never reversed, and the never-produced `CHARGEBACK` type stayed dead. Now `parseWebhook` returns a tagged union (charge\|dispute); `handleWebhook` dispatches on kind. Matched → `MoneyService.chargeback` posts a balanced `CHARGEBACK` reversal (drains coins back to `PAYMENT_CLEARING`, `drain` source so it posts even if already spent, idempotent on the intent), intent→`DISPUTED`, ERROR log. Unmatched (Stripe dispute carries the payment-intent id, not our checkout-session id) → ERROR log + metric, never silently dropped (Rule 8). `afristage_payment_disputes_total{provider,outcome}`, `PaymentStatus.DISPUTED` migration, public `apps/landing/refunds.html` (footer-linked, the evidence a dispute response cites), `docs/dispute-response.md` runbook. Deferred (Rule 0): trending dashboard, auto-evidence PDF, mobile wallet-checkout link | VERIFIED | 100% cov on every changed api file (payments.service, both providers, money.service chargeback, money-keys, metrics, payment-provider); full suite 736. Live on compose: signed `charge.success`→1000 coins; dispute→balanced `CHARGEBACK` (DEBIT 1000 coin/CREDIT 1000 clearing)→intent `DISPUTED`; replay idempotent (no 2nd reversal); unknown-ref→`unmatched`, no ledger post. **Staging deploy verified**: `add_payment_status_disputed` migration applied (logs), new build serving, webhook route enforces signature (unsigned→401), disputes metric registered, ledger-integrity cron OK (COIN=3260). Signed-dispute E2E not driven on staging (`railway ssh` isolated exec can't reach the web dyno; won't exfiltrate the webhook secret) — proven on the identical compose image instead | #183 |

| **Revenue-drop alert** (against "your payment webhook failed silently for 6h — no errors, no alerts"): audit found the premise ~70% false for AfriStage (lost webhooks self-heal via the #177 reconciliation sweep; real failures throw→retry), but the *"payments stopped while the server's healthy, no alarm"* corner was genuinely open. Added `signups`+`checkout_intents` counters (payments already via `moneyMoves`) + `RevenueMonitorService` `@Cron` (5-min): compares card checkouts STARTED vs payments SETTLED over a trailing window; checkouts ≥ `REVENUE_ALERT_MIN_CHECKOUTS` (default 3) but ZERO settled → ERROR log + `afristage_revenue_alert` gauge→1 + optional `REVENUE_ALERT_WEBHOOK_URL` POST. Windowed counts exposed as gauges; thresholds env-tunable with clamped safe defaults (Rule 10); webhook optional, failure never breaks the check (Rule 9). Deferred (Rule 0): payment-path synthetic (health synthetic #157 exists; a prod payment synthetic needs a safe test-mode), webhook DLQ (reconciliation sweep + throw-retry + log/metric already cover the money-losing surface) | VERIFIED | 100% cov on all changed files (metrics, auth.service, payments.service, revenue-monitor); full suite 751. Live on compose (real Postgres): seeded 3 checkouts/0 settled → `check()`→`{alerting:true}` + ERROR + gauge=1; a settled payment → `{alerting:false}` + gauge=0; `signups_total` 0→1 on register. **Staging deploy verified**: new build serving (no migration needed), revenue metrics exposed at `/api/metrics`, register→201→`signups_total` 0→1, and the cron advanced a 5-min tick with `signups_recent` 0→1 (real DB query live); `revenue_alert=0` (staging not stalled). To get the push alert, set `REVENUE_ALERT_WEBHOOK_URL` in Railway | #185 |
| **Revenue-alert Slack wiring verified end-to-end + staging test-residue cleanup**: `REVENUE_ALERT_WEBHOOK_URL` set in Railway; injected a real stall on staging (3 card checkouts that 502'd on the test Paystack key → counted as started, none settled) → cron logged `[ERRO] REVENUE ALERT` and POSTed to Slack with **no `webhook POST failed`** (POST succeeded → message delivered). Cleared the test stall via a legitimate settled mock payment (not by gaming the gauge), then reverted the temporary `REVENUE_ALERT_MIN_CHECKOUTS` silence override. **Ops learning:** `railway ssh` DB writes hung all session (isolated-exec PTY) — the reliable path is the Postgres service's `DATABASE_PUBLIC_URL` proxy + local Prisma datasource override (same `railway` db; not `railway connect`). Used it to delete the 3 FAILED test intents + 2 ledger-free throwaway users (FK-ordered), **preserving the 1 mock-purchase user** (immutable double-entry entry → deleting would unbalance the ledger) | VERIFIED (staging) | live: alert→Slack POST succeeded (no failure log); post-cleanup `ledger_integrity_ok=1`, `ledger_unbalanced=0`, `revenue_alert=0`, remaining test users=1 (mock-purchase user — removed in the next row) | — |
| **Ledger-safe teardown of the last test artifact** (reverse a settled purchase + delete its user without breaking double-entry integrity): a completed `COIN_PURCHASE` can't be row-deleted — its coin CREDIT and the shared clearing account's DEBIT are two legs of one balanced txn, so deleting the user's leg orphans the clearing leg and unbalances the ledger. Correct undo: delete the **whole** balanced transaction (both legs) + restore the shared `PAYMENT_CLEARING` account's materialised `balanceMinor` by the exact debit amount (undoing the drain), then FK-ordered delete the user — **all in one interactive transaction that re-checks the invariants before commit and rolls back on any drift** (global debit==credit; clearing balance == Σ its entries). Done via the `DATABASE_PUBLIC_URL` proxy path (railway ssh writes still dead) | VERIFIED (staging) | in-txn check passed pre-commit: clearing `−1500→−1400` == entry-sum `−1400`, global debit==credit `3260`; post: `REMAINING_TEST_USERS=0`, mock intent gone, app `ledger_integrity_ok=1` / `unbalanced=0` / `drifted=0`, `revenue_alert=0` | — |
| **Security & compliance audit-readiness pack** (against "your SaaS can't pass a security audit — the LLM was never built to prove production-readiness"): the controls existed but a reviewer's answers were scattered across 6 docs. New `docs/security-audit-readiness.md` — one questionnaire-shaped index (10 standard SIG-Lite categories: access/encryption/PCI/GDPR/sub-processors/AppSec/audit-trail/vuln-mgmt/BCP/IR) answered Yes/Partial/N-A, **every claim linked to the doc or code that proves it** (a control with no evidence link is not a control), plus an honest residual register (CI-off, no pen-test yet, no per-account lockout, backups need dashboard confirmation). Docs-only assembly, no code change. Deferred (Rule 0): a paid Burp pen-test + Actions CI, both gated on the first enterprise deal / revenue | VERIFIED (docs) | all 18 evidence links validated to resolve — 6 internal docs + 11 code paths exist + `AdminAuditLog` at `schema.prisma:547`; zero dead references | — |
| **Payment-path synthetic** (proactive money-loop probe; the #185-deferred item, un-deferred as beta waves approach): the revenue-drop alert is REACTIVE — it needs ≥3 real checkouts to fire, so in a quiet window (or the hour before a wave) a broken payment pipeline is invisible. `PaymentSyntheticService` `@Cron` (hourly, env-gated `PAYMENT_SYNTHETIC_ENABLED`, staging/mock-only) runs the REAL money loop on a dedicated synthetic user — create mock intent → `completeMock` credit → assert coins landed → `MoneyService.chargeback` reverse → assert net-zero → assert ledger integrity ok → `afristage_payment_synthetic_ok` gauge (1/0) + alert rules in phase-3-7. Self-cleaning via the existing chargeback path (balanced, integrity-safe; mock provider excluded from revenue-monitor). Deferred (Rule 0): prod-real synthetic (tiny charge+refund / provider test-mode), on-demand pre-wave trigger endpoint | VERIFIED (compose) | 100% cov on both changed files (payment-synthetic.service + metrics.service); full suite 763. **Live on compose Postgres**: 2 consecutive probes each `{ok:true, creditedDelta:100, reversedToBaseline:true, integrityOk:true}`, ledger integrity ok/unbalanced=0 before+after, gauge `afristage_payment_synthetic_ok 1`. Live-verify caught a real bug the mocks missed — `wallet.balance` threw `Missing COIN wallet` for the brand-new synthetic user; fixed by `ensureUserWallets` before the balance read. Staging deploy pending | — |
| **Web user client (`apps/web`) — the landing's "watch free" promise, finally built + deployed** (against "on Railway I can only reach admin login; there's no user surface"): the app was mobile-only; the landing sold "watch every stage free, no card" but its CTAs dead-ended at `#begin` / admin `/login`. Built the whole first-user journey as a new Next.js 14 workspace + a 5th Railway service. **Phase 0** (#192): public `POST /live-rooms/:id/guest-token` — a view-only (`canPublish:false`), LIVE-rooms-only, anonymous `guest_<uuid>` token so a signed-OUT visitor can watch (throttled 30/min). **Phase 1** (#193–#195): `apps/web` scaffold + `livekit-client` viewer (`/watch`, auto-discovers a live room); httpOnly-cookie auth cloned from admin-web's #182 proxy (login/register/logout + `/api/proxy` with single-flight refresh); `/wallet`, `/buy` (coin-packages → `card` intent → provider-HOSTED checkout, SAQ-A intact), and a `🎁 gift` drawer from the room. Deploy (#196): Railway `web` service, `$PORT`-bind fix. Deferred: in-browser video playback confirm (needs a live creator), the `/site` CTA repoint (blocked by a parallel workstream editing those files) | VERIFIED (staging) | 100% cov on all `lib/` logic (live+session+api+gifts, 22 tests); `next build` clean; Docker image builds. **Live money loop on compose to the coin**: register → buy 100 coins → gift 10 → balance 90 → replay same idempotencyKey → still 90 (no double-charge). **Live on the deployed Railway service** (`https://web-production-4ee7e.up.railway.app`): `/api/health` ok, home + `/watch` serve, register → both httpOnly cookies → authed proxy `wallet/me`+`coin-packages` [200] against staging, unauth proxy → 401, API CORS allows the web origin. NOT verified: real in-browser playback (0 live rooms on staging now) + card-checkout redirect (staging Paystack **test** key → 502) | #192–#196 |

| **Diamonds — the creator earning unit** (BIGO/TikTok's coins-to-spend / diamonds-to-earn model, minus the hidden spread): the `EARNING` wallet account (a creator's 60% gift share, `CREATOR_SHARE_BPS=6000`) is now branded **💎** in the mobile UI — **presentation only, NO ledger/currency/money-service change**, 1 💎 = 1 earned coin. Mobile wallet "Earnings summary"→"Diamonds" (💎 counts via a `gems()` formatter; the "Available balance" card keeps USD as the withdrawable cash value, so a creator sees "620 💎" **and** its "$" worth); go-live host earnings chip "N coins"→"N 💎"; explainer copy. Coins stay the viewer SPEND unit; web is viewer-only so no diamonds surface there. Deferred (Rule 0): profile's glanceable "Available" stat (whole screen untested — not worth rendering for 2 labels); a distinct `DIAMOND` ledger currency (off-brand — reintroduces the hidden spread; only for an opaque tunable earn-rate) | VERIFIED (mobile) | 100% cov on changed lines (`gems()`, wallet metrics, chip, explainer); 340 mobile tests + analyze clean. Ships with the next app build (Flutter — no Railway deploy). Scope: `docs/diamonds-earning-unit-scope.md` | #206 |
| **Web creator earnings view** (`/earnings`) — creators review earnings on desktop, not just mobile; diamonds-branded to match #206. Pure `apps/web` frontend on EXISTING endpoints via `/api/proxy` (`/creators/me/dashboard`, `/wallet/me`, `/payouts/me`) — no new API routes, no ledger touch. Shows 💎 available + its published fiat value, 💎 pending payout, lifetime stats (gifts/rooms/followers/watch-time), top supporters, payout history. Gated: 401→login, 403/404→"not a creator". One 2-field API touch: `/creators/me/dashboard` now returns `payoutRate`+`payoutCurrency` (`COIN_TO_FIAT_MINOR_RATE`=100 minor/💎, `CREATOR_PAYOUT_CURRENCY`=NGN) so the view shows 💎→fiat without hardcoding. `/wallet` gains a "Creator? View your earnings →" link. Read-only — payout REQUESTS stay on the KYC-gated mobile flow (Option B deferred) | VERIFIED (staging) | web 100% cov (119/119 stmts, 52/52 branches), 34 web tests + `next build` compiles `/earnings`; API `creators.service` spec asserts the new fields, full suite 771. **Live on staging**: deployed api+web, `/earnings` 200; seeded a REAL creator via the funnel (register→promote→LIVE room→buy→gift 1200 coins→earned 720 💎→requested 500 payout) → dashboard/wallet/payouts rendered through the exact `lib/creator.ts` formatters: "220 💎 available · ≈ ₦220.00 · 500 💎 pending · 1 Gifts/1 Rooms · Kwame 🪙1,200 · payout 500 💎 UNDER_REVIEW"; web login mints a token. Ledger-safe teardown after → 0 test users, `ledger_integrity_ok=1`, balanced 3260. Pixel screenshot not captured (Claude Chrome extension offline). Scope: `docs/web-creator-earnings-view-scope.md` | #207 |
| **Flutter web build hosted on Railway** (`flutter-web` service) — the mobile app (`apps/mobile`, incl. diamonds #206) now also runs as a hosted **Flutter web build** — the first real distribution target for mobile (no store signing / CI publish existed). Multi-stage Docker: `flutter build web --release --dart-define=API_BASE=<staging>` (else it defaults to `localhost:3000`) → static **nginx** that binds `$PORT` + answers `/api/health` (the shared `railway.toml` healthcheck path forced on every service) + SPA fallback. Pinned `cirruslabs/flutter:3.44.0` (the local 3.44.2 tag isn't published). New root `.dockerignore` excludes `apps/mobile/build` (1.5G) + `.dart_tool` + node_modules (upload 1.5G→18MB). Build number bumped `0.1.0+1`→`+2` | VERIFIED (staging) | Live at `https://flutter-web-production-b292.up.railway.app`: `/api/health` 200, app boots (title→"AfriStage Live") + renders. **Diamonds wallet rendered end-to-end** via Playwright headless — Flutter renders to CanvasKit (no DOM), so activated the hidden "Enable accessibility" semantics placeholder (JS click, it's off-viewport) → login form became drivable → logged in as a seeded creator → Earn tab: **"Total diamonds 720 💎 · Gift diamonds 720 💎"** beside "$720.00" available. Ledger-safe teardown after → 0 test users, `ledger_integrity_ok=1`, balanced 3260 | 1c51698, 33fb80d |
| **Tooling: Flutter/CanvasKit Playwright recipe → global `webapp-testing` skill** (extracted from the flutter-web hosting work above) — the reusable technique for driving a canvas-rendered Flutter web app in Playwright: it exposes **no selectable DOM** until the hidden `<flt-semantics-placeholder>` ("Enable accessibility") is clicked **via JS** (a normal click fails — it's off-viewport), which builds the real a11y DOM so `get_by_role`/`fill`/`click` work. Added to the existing global `webapp-testing` skill (`examples/flutter_canvaskit.py` + a Special-case pointer in SKILL.md) rather than a new skill — augment-over-create when a home exists | VERIFIED (skill) | example parses (valid Python), SKILL.md frontmatter intact + link resolves, skill present in the available-skills registry. Committed+pushed to `claude-skills-global` (`f46d711`); skill-fleet memory recorded + committed (`~/.claude f9e3404`) | f46d711 |
| **Native store distribution pipeline — Android foundation** (started — the app had debug-signing + no release pipeline; this is the first real native store path) — **Android release signing wired** in `build.gradle.kts` (reads gitignored `android/key.properties` → `signingConfigs.release`, with a **debug-signing fallback** so dev/CI still build without the secret). **Fastlane scaffolded**: `android/fastlane` (`internal` = Play internal-track draft, `production` = staged 10% rollout, over the AAB; key via `PLAY_SERVICE_ACCOUNT_JSON` env) + `ios/fastlane` (`beta` → TestFlight, ready for a Mac) + shared `Gemfile`. Secrets (`*service-account*.json`, `*.p8`, keystore, key.properties) gitignored. Runbook `docs/mobile-release.md` (versioning, real-keystore gen, Play Console + App Signing, fastlane commands, iOS prereqs, secrets checklist) | IN PROGRESS (Android build path VERIFIED; gated on store accounts) | Signed release **AAB builds (71M)** — signer cert `CN=AfriStage Upload TEST NONPROD` = the upload key from key.properties, **not Android Debug** (proven with a throwaway key, since removed → release now falls back to debug until the real key is dropped in). Fastlane **loads + lists the lanes** under Ruby 3.4 (android `internal`/`production`, ios `beta`) — not just `ruby -c` (macOS system Ruby 2.6 is too old; homebrew Ruby 3.4 works); secret paths confirmed gitignored. **Not operational** until the owner creates the Play Console account + real upload keystore + service-account JSON (can't create accounts / hold keys); iOS needs a Mac + Apple Developer. Interim channel stays the hosted flutter-web | 9a1dd89, 4fcbae4 |
| **Admin payout enablement** (closes the beta KYC gap the support playbook surfaced) — the payout gate needs `payoutEnabled && kycStatus=APPROVED` but nothing set them, so beta creators couldn't be enabled without hand-editing the DB. New `POST /api/admin/creators/:userId/payout {enabled}` (admin-only, audited): enabling sets both fields, disabling flips only the flag; mirrors approveCreator/rejectCreator. Same PR updates the beta-ops playbook row + known-gap (self-serve KYC still backlog) | VERIFIED (staging) | 100% cov on both changed files (creators.service, admin.controller — both branches + default); full api suite 773. **Live before/after on staging**: payout request → "Payout not enabled" → admin enables (DB confirms payoutEnabled=true, kyc=APPROVED, audit `CREATOR_PAYOUT_ENABLED`) → same request → "Insufficient earnings" (the next check, gate open); teardown clean, `ledger_integrity_ok=1` | #208 |
| **Beta-readiness ops pass** (make the closed beta supportable + observable, not just built) — three increments on `docs/phase-3-6-beta-launch-operations.md` + scripts: (1) customer-symptom **support playbooks** for go-live/watch, buy coins, gift, payout — each row grounded in a real `apps/api` throw + resolution endpoint (`513b6e2`); (2) **outside-in health monitor** `apps/api/scripts/beta-uptime.sh` (+ bundled stdlib `synthetic_check.py`) probing the deployed `/api/health`, `/live-rooms`, ledger-integrity metric → Slack-alert + exit 1 on failure — catches an API crash the in-API @Crons can't (`8a2c566`); (3) command-backed **GO/NO-GO checklist** — blockers vs should-have, honest current state (`68d4a84`) | VERIFIED (tooling) | monitor verified 3 ways (live staging all-pass exit 0; `--selftest` OK; dead-target all-fail exit 1); playbook diagnosis cmds + resolution endpoints grounded in code. **Monitor now scheduled** (`1254bfd`): `.github/workflows/synthetic-check.yml` runs the 3-probe checker (`tools/monitoring/beta-uptime.sh`) every 5 min off-platform (GitHub runners) — consolidated the accidental duplicate into the canonical `tools/monitoring/`. **Open blockers** (all owner-side, per the checklist): monitor runs only once **Actions billing is on** (or an external uptime ping) + repo secret `ALERT_WEBHOOK` set; staging payment key is a test key (502); prod flags (`REQUIRE_ADMIN_MFA` etc.) pending | 513b6e2, 8a2c566, 68d4a84, 1254bfd |
| **Global payouts — Phase A: per-currency settlement** (fixes a latent bug + unblocks worldwide creator payouts) — `request()` built the fiat snapshot from global env (`CREATOR_PAYOUT_CURRENCY=NGN`, one rate), **ignoring the payout method's currency**, so a GBP method was mis-recorded as NGN. Now derives `fiatCurrency` from the payout method (fallback env default) + `rate` from a per-currency `COIN_FIAT_RATES` table (fallback `COIN_TO_FIAT_MINOR_RATE`). Ledger unchanged (holds post in COIN); **no migration** (fields already existed). Phase B (Stripe Connect international rails) scoped in `docs/global-payouts-upgrade-scope.md`, gated on demand | VERIFIED (staging) | 100% cov on `payouts.service.ts` (all `coinFiatRate` branches + a GBP-method request); full api suite 775. **Live on staging**: GBP payout method → payout recorded `fiatCurrency=GBP, rate=100, fiatMinor=50000` (old build = NGN); ledger-safe teardown → 0 test users, `ledger_integrity_ok=1`. **Follow-up:** the per-currency rates are a pricing decision (current `=100` is a placeholder) | #209 |
| **Coin fiat value anchored to buy price + display fix** (closes the #209 follow-up) — the placeholder `=100` rate contradicted the buy price (100 coins = ₦1,000 = $1 → 1 coin = ₦10/$0.01), paying NGN creators **10× too little** and USD **100× too much**. Set `COIN_FIAT_RATES={"NGN":1000,"USD":1}` (config, live) so payouts settle at the real coin value (60% split already applied at gift). **Display fixed to match** (it showed 100×): mobile `usd()` (1 coin = $0.01 → "$620"→"$6.20") + `/creators/me/dashboard` `payoutRate` → `coinFiatRate(currency)` so web `/earnings` shows true fiat. NGN+USD only (markets with buy packages); rates recorded in `docs/global-payouts-upgrade-scope.md` | VERIFIED (staging) | 100% cov on `creators.service.ts` (usd line hit 9×); full api suite 775; mobile 340 + analyze clean. **Live on staging**: deployed dashboard `payoutRate` 100→**1000** (NGN) once `COIN_FIAT_RATES` took effect → `/earnings` real fiat; GBP payout proven in #209; cleanup 0 test users. **Note:** mobile display fix ships with the next app build (not live yet) | #210 |

| **Goal-interface fidelity pass**: landing hero exposure/composition now matches the supplied warm, luminous stage direction; mobile replaces missing glyphs with bundled Cupertino icons, tightens shared type/radii/navigation density, maps creator navigation to Home/Analytics/Go Live/Earn/Profile, adds distinct Go Live studio artwork, and introduces deterministic 390×844 captures for home, live room + gift drawer, Go Live, creator dashboard, and wallet | DEPLOYED (local) | landing test 2/2 + optimized admin-web build; mobile analyze clean + full suite baseline 339 passed (1 capture-only test skipped by default); final focused navigation/live/widget/capture suite 127/127; matched source/current review recorded in `design-qa.md`. Not `VERIFIED` until deployed/device evidence exists | — |

Reusable skill created (2026-07-18): `~/.claude/skills/retention-instrumentation/`
— the #173 measurement pattern generalized (NestJS/Prisma reference + Django/
Rails/raw-SQL ports), for use across other projects.

Still pending for full production: real `PAYSTACK_SECRET_KEY`,
`NODE_ENV=production` + `REQUIRE_ADMIN_MFA=true`, alert webhook on the synthetic
check, `RESEND_API_KEY` to light up email delivery. Remaining wave-1 checks:
physical-device camera publish (emulator can't capture; #172), and imagery
provenance for the `/site` marketing photos before any marketing push (#171).

## Verification debt

These are `DEPLOYED` (tests/build pass) but **not yet `VERIFIED`** in production
(no prod logs / live evidence):

- **Now staging-verified with live evidence (debt retired):** the payments work
  (#183 disputes, #185 revenue-alert), the whole web client (#192–#207), and the
  diamonds/earnings work — API `/creators/me/dashboard` fiat fields proven on the
  deployed API via a throwaway creator; the `/earnings` view + the mobile Diamonds
  wallet both **rendered live from a real gift→earnings funnel** (720 💎), each with
  a ledger-safe teardown + `ledger_integrity_ok=1` after. Staging is the only
  deployed environment, so "staging live" is the bar here — not local-only.
- **Still local-only (unchanged debt):** the older mobile/landing design passes
  (goal-interface fidelity, captures) — host-GPU emulator + jest/flutter suites, no
  deployed evidence. GitHub Actions is billing-blocked, so CI evidence is
  unavailable; merges rest on local green.
- **Native mobile distribution — foundation started, gated on accounts:** Android
  release signing is wired + verified (a signed AAB builds; `9a1dd89`), and fastlane
  is scaffolded for Play + TestFlight (`4fcbae4`; see `docs/mobile-release.md`). It is
  **not yet operational** — needs the owner's Play Console account + real upload
  keystore + service-account JSON (accounts/keys I can't create), and iOS needs a Mac +
  Apple Developer. The hosted `flutter-web` service remains the interim channel.
  Physical-device camera publish (#172) also still pending (emulator can't capture).
- The coin-overdraw fix (#29) relies on Postgres row locks under real concurrency.
  ✅ Now covered by a real-DB concurrency test (#34) — proven under 20 parallel
  gifts on a local Postgres, with teeth verified (guard removed → overdraw). The
  remaining gap to `VERIFIED` is the same as everything else: evidence from a
  deployed prod/staging environment, not just local.

## Notes

- Test runner for `apps/api` is **jest** (not vitest, despite some docs).
- Run: `cd apps/api && npm test` · `cd apps/mobile && flutter test`.
