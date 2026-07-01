# Phase R2 — BIGO UX Flow Teardown

Clean-room reverse engineering of BIGO's **observable user journeys**, rebuilt as
AfriStage flows and grounded in what AfriStage has **actually built** (real API
endpoints and mobile screens), not aspiration.

Legend used throughout:

- **LIVE** — implemented in AfriStage today (endpoint + screen exist).
- **ADAPT** — implemented but intentionally renamed/re-shaped for Africa.
- **GAP** — BIGO has it, AfriStage does not yet (P2/P3 in R1).

Ground truth (this repo):

- **API modules**: `auth, users, creators, live-rooms, chat, gifts, wallet, payments, payouts, moderation, reports(=moderation), support, notifications, fraud, uploads, beta, analytics, admin`.
- **Mobile screens**: feed, live/room, go-live-setup, creator apply/profile/rooms, wallet, gift-history, payout-history, payout-methods, report, support (+ticket), notifications, search, blocked-users, onboarding, register/login, profile, history.
- **Not built yet**: PK/battles, families/circles, agencies, events, missions/tasks, leaderboards service. These are inferred/planned below.

---

## 0. Flow coverage summary

| BIGO journey        | AfriStage status | Backing surface |
| ------------------- | ---------------- | --------------- |
| Viewer entertainment | **LIVE** | feed → room → chat → gift |
| Creator earning     | **LIVE** | apply → dashboard → go-live → ledger |
| Gift send           | **LIVE** | wallet → gift drawer → `POST live-rooms/:id/gifts` |
| Cashout             | **LIVE** | payout method → request → admin review → paid |
| Report/moderation   | **LIVE** | report modal → admin queue → action |
| Admin operations    | **LIVE** | admin-web (dashboard, payouts, reports, ledger…) |
| PK / battles        | **GAP (P2)** | inferred below |
| Families / Circles  | **GAP (P2)** | inferred below |
| Agencies            | **GAP (P3)** | inferred below |

The whole P0 incentive loop (attention → gift → creator earnings → payout → safety) is **already wired end-to-end**. R2 documents those flows precisely so R3+ can extend them without re-deriving them.

---

## 1. Viewer flow (LIVE)

**BIGO observable:** open app → browse live thumbnails → tap a stream → watch → chat/react → send a gift → get recognised as a supporter → follow → return.

**AfriStage flow (grounded):**

```text
Launch app
→ onboarding_screen / login_screen        (auth: POST /auth/login, refresh cookie in web-admin)
→ feed_screen                             (GET /live-rooms/upcoming + live feed)
→ tap a room
→ room_screen / livekit_room_view         (GET /live-rooms/:id, POST /live-rooms/:id/join-token)
→ realtime chat                           (socket chat + GET /live-rooms/:id/messages)
→ open gift drawer                        (GET /gifts)
→ send gift                               (POST /live-rooms/:roomId/gifts)  ← wallet debit + creator credit
→ appears in top gifters                  (GET /live-rooms/:roomId/top-gifters)
→ follow creator / set reminder           (POST /live-rooms/:id/remind)
→ notifications bring them back            (GET /notifications/me)
```

**State machine (viewer in a room):**

```text
BROWSING → JOINING (join-token) → WATCHING
WATCHING → CHATTING → GIFTING → RECOGNISED (top-gifter)
WATCHING → LEFT (room ends / user exits)
Any → BLOCKED/MUTED (moderation event)
```

**Decision points that drive revenue:**

- First gift conversion: gift drawer must be one tap from the room (LIVE).
- Recognition feedback: top-gifter surface is the status hook (LIVE via `top-gifters`).
- Return trigger: reminders + notifications (LIVE).

**Gaps vs BIGO:** no supporter *ranks/badges over time* (only per-room top gifters), no *nearby* discovery ordering, no *fan club* join. → R4.

---

## 2. Creator flow (LIVE)

**BIGO observable:** apply/qualify → go live → receive gifts → accumulate Beans → withdraw.

**AfriStage flow (grounded):**

```text
creator_apply_screen                      (POST /creators/apply)
→ admin approval                          (admin-web: POST /admin/creators/:userId/approve)
→ creator_screen / creator_profile        (GET /creators/me, GET /creators/me/dashboard)
→ go_live_setup_screen                    (create room)
→ POST /live-rooms/:id/start              (goes LIVE)
→ viewers send gifts                      (credits Creator Earnings ledger)
→ creator_rooms_screen / dashboard        (GET /creators/me/rooms, GET /wallet/me/ledger)
→ POST /live-rooms/:id/end
→ earnings visible in wallet_screen       (GET /wallet/me)
```

**Creator lifecycle state machine:**

```text
APPLIED → PENDING_REVIEW → APPROVED → (REJECTED | SUSPENDED)
APPROVED → LIVE (room started) → OFFLINE (room ended)
SUSPENDED blocks go-live (moderation/fraud driven)
```

**AfriStage difference from BIGO:** the earning currency is a transparent **Creator Earnings ledger** (`wallet/me/ledger`), not an opaque "Beans" balance. Every gift is a ledger transaction (double-entry, see `docs/wallet-ledger-design.md`), which is what makes payouts auditable.

**Gaps vs BIGO:** no creator *analytics over time* beyond the dashboard snapshot, no *monthly statements*, no *agency-managed* creators. → R3/R4.

---

## 3. Gift flow (LIVE) — the monetisation core

**BIGO observable:** buy Diamonds → open gift panel → pick gift → send → animation plays → streamer's rank/recognition updates → Beans accrue to streamer.

**AfriStage flow (grounded), split into the two sub-flows:**

**3a. Buy Coins (top-up):**

```text
wallet_screen
→ choose coin pack                         (payments module: create payment intent)
→ pay via local rail                       (mobile money / card / bank transfer)
→ webhook confirms                         (payment webhook → wallet credit)
→ coin balance updated                     (GET /wallet/me)
```

**3b. Send Gift (spend):**

```text
room_screen gift drawer                    (GET /gifts — catalog)
→ select gift
→ POST /live-rooms/:roomId/gifts           (atomic: debit viewer coins, credit creator earnings, write ledger txn)
→ animation + chat event broadcast
→ top-gifters recomputed                   (GET /live-rooms/:roomId/top-gifters)
→ gift_history_screen for the viewer       (GET /gifts/me)
```

**Money-correctness invariants (already enforced):**

```text
- One gift = one ledger transaction with balanced DEBIT/CREDIT entries.
- Viewer coin debit and creator earnings credit happen atomically (no half-gift).
- Ledger integrity is checkable (admin-web: /ledger-integrity, GET /admin/ledger/integrity).
- Fraud scoring runs per creator before payout (GET /admin/fraud/creators/:id).
```

**Currency naming (ADAPT):** Coins (purchase) + Creator Earnings (cashout value) — deliberately *not* Diamonds/Beans.

**Gaps vs BIGO:** no **limited-time / event gifts**, no **combo/streak** multipliers, no **gift-driven leaderboards** beyond per-room. → R3.

---

## 4. Cashout flow (LIVE) — trust backbone

**BIGO observable:** eligible creator converts Beans → requests withdrawal → platform reviews → paid to local method.

**AfriStage flow (grounded):**

```text
payout_methods_screen                      (GET/POST /payouts/methods — bank/mobile-money destination)
→ payout request                           (POST /payouts/request)
→ status: UNDER_REVIEW
→ admin-web payout queue                   (GET /admin/payouts)
     ├─ hold      (POST /admin/payouts/:id/hold)      → HELD
     ├─ release   (POST /admin/payouts/:id/release)   → UNDER_REVIEW
     ├─ reject    (POST /admin/payouts/:id/reject)    → REJECTED (reason)
     ├─ approve   (POST /admin/payouts/:id/approve)   → APPROVED   (blocked if ledger imbalance)
     └─ mark-paid (POST /admin/payouts/:id/mark-paid) → PAID       (external transfer reference required)
→ payout_history_screen                    (GET /payouts/me)
```

**Payout state machine:**

```text
REQUESTED → UNDER_REVIEW → (HELD ↔ UNDER_REVIEW) → APPROVED → PAID
UNDER_REVIEW/HELD → REJECTED (reason recorded)
APPROVE is gated: refused while ledger integrity != ok (WarningBanner in admin-web)
MARK-PAID requires an external transfer reference so PAID stays reconcilable
```

**Controls already present:** ledger-integrity block on approval, per-creator fraud risk flags on the payout row, destination reference masking, reason capture on hold/reject. This is the strongest-differentiated flow vs a naive clone — it's the reason creators can trust the platform.

**Gaps vs BIGO:** no **auto-approval tiers** for low-risk creators, no **scheduled/batch** payouts, no **reconciliation export**. → R3.

---

## 5. Report / moderation flow (LIVE) — safety backbone

**BIGO observable:** user reports a room/user → platform triages by severity → actions (mute/ban/remove) → protects trust and payments.

**AfriStage flow (grounded):**

```text
report_screen (in room or on profile)      (POST /reports {reason, priority, target})
→ admin-web Reports queue                   (GET /admin/reports — priority + status filters)
→ moderator acts                            (POST /admin/reports/:id/action {action, reason})
     actions: REVIEWING, ESCALATE, DISMISS, ACTIONED, SUSPEND_USER, SUSPEND_ROOM
→ user-level enforcement                     (POST /admin/users/:id/suspend | /ban)
→ audit trail                                (admin audit logs; GET /admin/audit-logs)
```

**Report state machine:**

```text
OPEN → REVIEWING → (ACTIONED | DISMISSED)
OPEN/REVIEWING → ESCALATE (raises priority)
Target user: ACTIVE → SUSPENDED → BANNED (with reason + audit entry)
```

**Priority routing (LIVE):** CRITICAL reports surface first in the queue (admin-web PriorityBadge + priority filter). Policy lives in `docs/moderation-policy.md`.

**Gaps vs BIGO:** no **auto severity scoring / ML triage**, no **in-room instant mute by other users**, no **image/stream content scanning**. → R4/R5.

---

## 6. Support flow (LIVE) — payment/payout trust

Not in BIGO's public feature list per se, but essential for money movement in African markets. Already built:

```text
support_screen → support_ticket_screen      (GET /support/tickets/me, POST /support/tickets/:id/messages)
→ admin replies                             (POST /admin/support/tickets/:id/messages)
→ ticket status tracked                     (admin-web Support queue)
```

State: `OPEN → IN_REVIEW → RESOLVED`. Tickets can link to a payment/payout/room for context.

---

## 7. PK / Battle flow (GAP — P2, inferred)

**BIGO observable:** two creators split-screen → viewers pick a side → gifts add to each side's score → countdown timer → last-second "snipe" swings → winner gets a ranking/reward boost → highlight clip seeds the next battle.

**AfriStage target flow (to build in R3):**

```text
Two live creators enter a battle session      (NEW: battle service — session, two participants, timer)
→ viewers see split UI + two score bars       (NEW: battle room UI)
→ gift to a side                              (REUSE POST /live-rooms/:roomId/gifts, tagged to battleId+side)
→ score = sum of side's gift value            (NEW: score aggregation on gift events)
→ timer expires                              (NEW: battle timer + final settle)
→ winner ranking boost                       (NEW: leaderboard write)
→ highlight/clip                             (P3: clip service)
```

**What's reusable today:** the gift send + ledger path is unchanged; a battle is a *scoring overlay* on existing gifts. **New services required:** battle session, timer/settle, score aggregation, leaderboard. **Africa adaptation (from R1):** structured formats (Afrobeats vs Amapiano, Lagos vs Accra comedy, dance/campus/gospel), with anti-gambling guardrails (no cash wagering; gifts are appreciation, winner gets *status*, not a pot).

---

## 8. Family / Circle flow (GAP — P2, inferred)

**BIGO observable:** users join/create a Family with combat points, family/member levels, rankings, tasks, and rewards; the group gifts collectively and competes.

**AfriStage target flow (to build in R4) — "Creator Circles":**

```text
Creator creates/joins a Circle               (NEW: circle model — membership, roles)
→ members support each other's rooms          (REUSE existing rooms/gifts)
→ Circle earns points from gifts + tasks       (NEW: point aggregation)
→ Circle appears on regional leaderboard       (NEW: leaderboard)
→ Circle unlocks events/perks                  (depends on events service, P2)
```

**Africa adaptation:** City / Campus / Diaspora / Music-label / Comedy-house / Faith Circles. **Guardrail (from R1):** do **not** ship Circles before moderation + fraud + payout controls are mature (they are now, for P0) — but Circles add collective-gifting fraud surface, so fraud rules must extend to group flows first.

---

## 9. Agency flow (GAP — P3, inferred)

**BIGO observable:** third-party agencies recruit/manage hosts and earn commission; scales creator supply.

**AfriStage target flow (R5) — "Partner Agencies":**

```text
Agency onboarded + vetted                     (NEW: agency profile, compliance/KYC)
→ agency recruits creators                     (creators linked to agency)
→ agency dashboard: managed creators' activity (NEW: partner dashboard)
→ commission computed from managed earnings    (NEW: commission ledger entries)
→ admin oversees agencies + commissions        (NEW: admin agency controls)
```

**Reuse:** creator + earnings ledger already exist; agency adds a *relationship + commission split* layer. **Africa adaptation:** vetted local managers (NG/GH/KE/ZA) with local compliance; commission as explicit ledger entries (auditable), not off-book.

---

## 10. Admin inference (LIVE) — what the operator surface must do

BIGO's admin is invisible externally; AfriStage's is fully built (`apps/admin-web`). The teardown of "what any BIGO-style platform's admin must handle" maps 1:1 to what AfriStage already has:

| Operator need (inferred from BIGO mechanics) | AfriStage admin surface (LIVE) |
| --- | --- |
| See platform health at a glance | Dashboard (`GET /admin/dashboard`) — active rooms, pending payouts, critical reports, ledger status |
| Approve/reject creators | Creators queue (`/admin/creators/:userId/approve|reject|suspend`) |
| Review the money queue | Payouts queue (hold/release/approve/reject/mark-paid) |
| Investigate payments | Payments view (`GET /admin/payments`) |
| Guarantee financial correctness | Ledger + Ledger Integrity (`GET /admin/ledger/integrity`) |
| Handle safety | Reports queue + user suspend/ban + audit logs |
| Handle user trust | Support queue |
| Manage the gift economy | Gifts admin (`POST/PATCH /admin/gifts`) |
| Assess payout risk | Fraud (`GET /admin/fraud/creators/:id`) |
| Find any record fast | Global search (users/creators/rooms/reports/payments/payouts/gifts/tickets) with `?id=` click-through |
| Watch beta rollout | Beta Ops (`GET /admin/beta-ops`) |

**Inference for R3+:** when PK/Circles/Agencies land, each needs an admin surface too (battle audit, circle moderation, agency/commission controls) — the admin-web is the pattern to extend, not rebuild.

---

## 11. Cross-flow observations (what the teardown reveals)

1. **One money path, many surfaces.** Every gifting surface (room, and later battles/circles/events) funnels through the *same* `POST /live-rooms/:roomId/gifts` + double-entry ledger. New "engagement" features should be **scoring/relationship overlays** on that path, never new money paths. This is the single most important reverse-engineering insight: BIGO's dozen features share one economic core.

2. **Recognition is the conversion lever.** BIGO monetises *status*, not video. AfriStage already has the atom (top-gifters); the P1/P2 work (ranks, badges, leaderboards, circles) is all *amplifying recognition*, not new plumbing.

3. **Trust gates unlock growth features.** R1 was right to sequence PK/Circles/Agencies after payout+moderation+fraud. Those gates are now built for P0, so R3 (battles) is unblocked — but each new *collective* flow (circles, agencies) must extend fraud rules before launch.

4. **The admin surface is the moat.** The auditable ledger + payout controls + moderation + fraud flags are what a surface-level clone can't fake, and they're the reason creators get paid reliably. Keep every new feature's money and safety effects visible in admin-web.

---

## 12. Handoff to R3

R2 confirms the P0 loop is fully wired. R3 (Monetisation System Teardown) should specify, on top of these flows:

```text
- coin pack pricing model (local currency tiers)
- gift catalog economics (price → creator share → platform margin)
- ranking incentive math (what score = what reward)
- limited-time / event gift mechanics
- payout tiers + auto-approval risk thresholds
- VIP / fan-club (Supporter Circle) monetisation
```

Each must be expressed as **overlays on the existing gift+ledger+payout path** documented above — no parallel money systems.
