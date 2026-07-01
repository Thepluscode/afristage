# Phase R4 — Community / Growth System Teardown

Clean-room teardown of BIGO's retention/growth layer, specified as **overlays on
AfriStage's existing money + ledger spine** (the hard rule carried from R1→R3:
*no growth feature invents a new money path*). Grounded in what ships today.

Status legend: **LIVE** (built) · **PARTIAL** (building blocks exist) · **GAP** (to build).

Ground truth (this repo):

- Notifications — **LIVE**: `notifyUser(type,title,body)` + `notifyFollowersCreatorLive` (`CREATOR_LIVE`); endpoints `me / unread-count / read-all / :id/read`; `notifications_screen`.
- Discovery — **PARTIAL**: ranked live feed (`live-rooms.service.ts#list`, explainable weighted score in `ranking.ts`, hard `country`/`category` filters, soft `viewerLanguage`/`viewerCountry`, 10-min gift-velocity window) + `upcoming` feed.
- Leaderboard aggregation — **PARTIAL**: per-room `top-gifters` + analytics `overview`/`series` (gift-volume sums) — the aggregation pattern exists; no persistent ranking service.
- Fraud guardrail — **LIVE**: per-creator risk 0..1 with explainable factors, `PAYOUT_HOLD` at ≥ 0.6 (`fraud` service). This is the hook every collective flow must extend.
- Families/Circles, Fan clubs, Agencies, Events, Missions — **GAP**.

---

## 0. The one rule (why this phase is mostly "overlays")

Every mechanic below reduces to one of three primitives, none of which is a new
money path:

```text
AGGREGATION  — reads over GiftTransaction / ledger (leaderboards, missions, circle points)
RELATIONSHIP — a link + optional split leg on the existing gift (fan clubs, agencies, circles)
VISIBILITY   — catalog/feed scoping (events, nearby, limited gifts)
```

If a proposed feature needs a *fourth* thing — minting coins, a parallel wallet,
an off-ledger reward — that's a design smell. Rewards that grant coins must debit
a **funded promo account**, never mint (see §5, §4).

---

## 1. Notifications (LIVE) — the return engine

The growth flywheel is worthless without a return trigger; this is the one growth
system already built.

**Today:** generic `notifyUser(userId, type, title, body)` + a `CREATOR_LIVE`
fan-out to followers when a creator goes live. Inbox + unread badge + per-item
and mark-all read (see admin-web topbar / mobile `notifications_screen`).

**R4 extension — a trigger taxonomy** (all reuse `notifyUser`, no new plumbing):

| Trigger | Fires when | Loop it closes |
| --- | --- | --- |
| `CREATOR_LIVE` (LIVE) | followed creator starts | viewer return |
| `GIFT_RECOGNITION` | you become top gifter / a tier | supporter status |
| `PAYOUT_STATUS` (LIVE in payouts) | payout approved/paid/rejected | creator trust |
| `CIRCLE_EVENT` | your circle ranks / unlocks | community pull |
| `MISSION_READY` | a daily mission is claimable | habit |
| `EVENT_STARTING` | subscribed event begins | spike attendance |

**Guardrail:** preference/opt-out per type + rate-limit (no spam) before adding
the high-frequency ones (`MISSION_READY`, `EVENT_STARTING`).

---

## 2. Nearby / Local discovery (PARTIAL) — "Local Stage"

**BIGO observable:** surface local live creators to boost relevance.

**Already built:** the ranked feed filters on `country`/`category` and softly
boosts same-`language`/`country` viewers, with an explainable score
(`ranking.ts`) and a gift-velocity signal — i.e. "local + hot" is already a
first-class ordering.

**R4 to add (VISIBILITY only):**

```text
- city/state granularity (privacy-safe: opt-in coarse location, never exact)
- a "Local Stage" tab = the existing ranked feed pre-filtered to the viewer's region
- category shelves (Afrobeats / comedy / gospel / gaming) = existing category filter
```

No new service — this is UI + query params over `live-rooms.service.list`.
**Guardrail (Africa/privacy):** coarse, opt-in location; never expose precise
geo; respect the R1 "privacy-safe" requirement.

---

## 3. Leaderboards (PARTIAL) — regional/category charts

**BIGO observable:** rank creators/supporters/families for status competition.

**Already built:** per-room top gifters + analytics gift-volume sums — the
aggregation primitive. Missing: persistent, windowed, scoped rankings.

**R4 design (AGGREGATION only — pure reads):**

```text
Leaderboard(scope, window) = Σ GiftTransaction.totalCoinAmount grouped by subject
  scope   ∈ { creator, supporter, circle } × { city, country, category, global }
  window  ∈ { daily, weekly, all-time }
  subject = creatorId | senderId | circleId
```

Ship as a read/aggregation job (cron-materialised per window for cost), never a
new charge. This is the direct amplifier of the recognition atom from R2/R3.

**Guardrail:** windowed sums must read the **settled** ledger (exclude
refunded/charged-back gifts) so rankings can't be gamed by reversible spend.

---

## 4. Missions / Daily tasks (GAP) — habit formation

**BIGO observable:** reward users for watch/chat/follow/gift/invite to build
habit and drive feature discovery.

**R4 design (AGGREGATION + a funded reward):**

```text
Mission = { action, target, reward, window }
progress = count of qualifying events in window (reads existing events:
           room joins, chat msgs, follows, gifts sent, invites)
claim → credit reward from a PROMO wallet account (funded, debited) → user COIN
```

**Hard rule:** the reward path **debits a funded `PROMO_REVENUE`/`PROMO_CLEARING`
system account** — coins are moved, never minted, so ledger integrity holds and
the promo budget is a real, capped line item. **Guardrail:** anti-farming (self-
gifting, invite fraud) must run through the existing fraud scorer before any
coin-granting mission goes live.

Africa framing: watch, chat, follow, gift, invite, **report-quality** (reward
good-faith moderation) — the last one turns safety into a rewarded habit.

---

## 5. Events (GAP) — activity spikes

**BIGO observable:** platform campaigns with limited gifts + event leaderboards.

**R4 design (VISIBILITY + AGGREGATION):**

```text
Event = { window, gift catalog subset (time-boxed), leaderboard scope }
- event gifts are normal gifts (still 60/40 split, same ledger) flagged eventId
- event leaderboard = §3 aggregation scoped to eventId + window
- optional prize pool = payout from a FUNDED event-prize account (never mint)
```

Africa framing (R1): Afrobeats nights, comedy rooms, diaspora weekends, gospel
challenges. Scarcity + occasion, **zero new economics** — only catalog visibility
and ranking scope change.

---

## 6. Fan clubs (GAP) — "Supporter Circle" / Inner Stage

**BIGO observable:** paid/loyalty club around a creator; belonging + status.

**R4 design — prefer the RELATIONSHIP-via-threshold model first:**

```text
Supporter tier = relationship(creatorId, userId, tierLevel)
  earned by cumulative gifting (pure read over the ledger — free to run), OR
  joined via a one-off coin "join gift" (reuses §gift split, no new money path)
perks = room badge, supporter-only chat colour, top-of-supporters placement
```

Threshold-first means **no subscription/dunning surface** at launch — existing
gifting becomes loyalty status at zero new billing risk. Recurring subscriptions
(auto-renew) are **P3**: they need a billing/renewal/failed-payment service and
are the only genuinely new money path in this phase — defer until the core
loop's revenue is proven.

---

## 7. Circles / Families (GAP) — community retention

**BIGO observable:** groups with points, levels, ranks, tasks, rewards; collective
gifting + competition.

**R4 design (RELATIONSHIP + AGGREGATION):**

```text
Circle = { members[], roles }
circle points = §3 aggregation of members' gift activity + §4 mission completions
circle rank = leaderboard scope 'circle'
perks/events reuse §5/§6
```

Africa framing (R1): City / Campus / Diaspora / Music-label / Comedy-house / Faith
Circles.

> **Sequencing guardrail (the important one):** collective flows multiply the
> fraud surface (coordinated self-gifting, circle wash-trading to farm points and
> event prizes). The fraud scorer (LIVE, per-creator) must be **extended to group
> aggregates** — circle-level velocity, member-overlap, circular-gifting
> detection — *before* Circles or circle-scoped prizes launch. Do not ship
> collective rewards on a per-creator-only fraud model.

---

## 8. Agencies (GAP — P3) — creator supply scaling

**BIGO observable:** third-party managers recruit/manage hosts for commission.

**R4/R5 design (RELATIONSHIP + a third split leg):**

```text
Agency = { profile, KYC/compliance, managedCreators[] }
commission = explicit ledger entries: on a managed creator's earning credit,
             split a configured bps to an AGENCY_EARNING account (a third leg on
             the existing gift transaction), fully auditable — never off-book
admin controls: onboarding/vetting, commission config, suspension
```

Africa framing: vetted local managers (NG/GH/KE/ZA) with local compliance.
**Guardrail:** agency commission is a *ledger split*, so it's visible in
ledger-integrity and the payout audit — the same transparency that protects
creators protects against agency skimming.

---

## 9. Build order (R4 slice, dependency-honest)

```text
1. Notification trigger taxonomy + preferences   (extends LIVE; unlocks every loop)
2. Leaderboards (creator/supporter, windowed)    (AGGREGATION over settled ledger)
3. Local Stage tab                               (VISIBILITY over existing ranked feed)
4. Missions + PROMO funded reward account         (needs anti-farm fraud checks)
5. Events (limited gifts + event leaderboard)     (VISIBILITY + AGGREGATION)
6. Supporter Circle (threshold model)             (RELATIONSHIP, no billing)
   --- gate: extend fraud scorer to group aggregates ---
7. Circles/Families (points, ranks)               (RELATIONSHIP + AGGREGATION)
8. Agencies (commission split leg)                (P3; RELATIONSHIP + ledger split)
9. Subscriptions / recurring fan clubs            (P3; the only new money path — last)
```

The single carried rule, one more time: **growth features are aggregation,
relationship, and visibility layers over the coin + double-entry ledger.** Two
things in this phase touch real money — mission rewards (must debit a funded
promo account) and recurring subscriptions (a genuine new money path, deferred to
last) — and both are called out so they don't sneak in unledgered.

---

## 10. Handoff to R5 (Architecture inference)

R1–R4 define *what* and *why*. R5 specifies the *how* at the system level:
streaming, realtime chat, wallet/ledger, recommendation (the `ranking.ts` feed),
moderation + fraud (extended to groups), event/ranking aggregation jobs, and the
agency/creator relationship model — with the constraint that the ledger remains
the single source of financial truth for every overlay above.
