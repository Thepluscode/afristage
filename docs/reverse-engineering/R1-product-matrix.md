# Phase R1 — BIGO Product Reverse-Engineering Matrix

This is **clean-room reverse engineering**: studying BIGO’s public product mechanics and rebuilding original AfriStage equivalents. No APK decompiling, no private API scraping, no copying proprietary assets.

BIGO publicly presents itself as a live-streaming platform with live streams, live chat, virtual gifts, multi-guest rooms, audio rooms, video calls, PK battles, game streaming, filters/stickers, location-based discovery, fan clubs, task rewards, and official events. Its own materials also describe the gift economy as: users buy Diamonds, send gifts, creators receive Beans, and Beans can be converted into cash where eligible.

---

## 1. Core product matrix

| BIGO system              | What it does                                   | Why it exists                                       | Monetisation role                     | AfriStage clean-room equivalent  | Africa-specific adaptation                                      | MVP priority |
| ------------------------ | ---------------------------------------------- | --------------------------------------------------- | ------------------------------------- | -------------------------------- | --------------------------------------------------------------- | ------------ |
| Live streaming rooms     | Creators broadcast live video to viewers       | Core entertainment surface                          | Drives gifts, followers, retention    | AfriStage Live Rooms             | Optimised for unstable mobile data and mid-range Android        | **P0**       |
| Live chat                | Viewers react in real time                     | Converts passive watching into participation        | Increases gift triggers               | Realtime room chat               | Lightweight Socket.IO chat, simple moderation                   | **P0**       |
| Virtual gifts            | Viewers send paid animated gifts               | Creator appreciation + status signalling            | Main revenue loop                     | Coins → Gifts → Creator earnings | Local pricing, mobile money/card/bank transfer rails            | **P0**       |
| Diamonds / Beans model   | User currency and creator earning currency     | Separates purchase currency from cashout value      | Controls platform margin/accounting   | Coins + Creator Earnings Ledger  | Transparent earnings wallet, payout holds, local currency views | **P0**       |
| Multi-guest rooms        | Multiple users join audio/video seats          | Makes livestreams social, not one-way               | More engagement, more gifting moments | Guest seats / co-host rooms      | Start with audio guest seats before full video grid             | **P1**       |
| Voice chat rooms         | Audio-only rooms                               | Low-friction community rooms                        | Gifting without video pressure        | AfriStage Audio Rooms            | Powerful for low-data African markets                           | **P1**       |
| PK battles               | Two creators compete; viewers gift to score    | Competition, urgency, “last-second snipe” behaviour | High gift acceleration                | AfriStage Battles                | Local music/comedy/dance battles, anti-gambling guardrails      | **P2**       |
| Fan clubs                | Paid/loyalty community around creator          | Belonging and status                                | Recurring engagement and gift loyalty | Creator Circles                  | Diaspora supporter clubs, local fan communities                 | **P2**       |
| Families                 | Creator/viewer teams with points, tasks, ranks | Group identity and retention                        | Collective gifting + competition      | Creator Circles / Communities    | Campus, city, church, comedy, music collectives                 | **P2**       |
| Agencies                 | Third-party talent recruiters/managers         | Creator supply growth                               | Scales host acquisition               | AfriStage Partner Agencies       | Local creator managers in Nigeria, Ghana, Kenya, South Africa   | **P3**       |
| Leaderboards             | Rank creators/supporters/families              | Status competition                                  | Encourages repeat gifting             | Regional Charts                  | City/country/category leaderboards                              | **P1**       |
| Official events          | Platform-wide campaigns with prizes            | Creates spikes in activity                          | Limited gifts, event gifting          | AfriStage Events                 | Afrobeats nights, comedy rooms, diaspora weekends               | **P2**       |
| Task center              | Rewards users for actions                      | Habit formation and feature discovery               | Nudges gift/chat/live behaviour       | Daily Missions                   | Watch, chat, follow, gift, invite, report quality               | **P2**       |
| Nearby discovery         | Shows local live creators                      | Local relevance                                     | Improves discovery and social bonding | Local Stage                      | City/state/country discovery, privacy-safe                      | **P2**       |
| Filters/stickers/effects | Makes creators camera-ready                    | Reduces creator anxiety, improves entertainment     | Premium effects, better retention     | Creator Studio Effects           | Lightweight filters first; avoid heavy AR v1                    | **P3**       |
| Game streaming           | Gaming live category                           | Broadens content verticals                          | Gifts, sponsorship, watch time        | AfriStage Gaming                 | Mobile gaming, football watch parties, esports rooms            | **P3**       |
| Reporting/moderation     | Users report bad content/users                 | Safety and regulatory protection                    | Protects trust and payouts            | Reports + Admin Moderation       | Underage, scam, harassment, payment fraud priority              | **P0**       |

---

## 2. Reverse-engineered product loops

### Loop A — Viewer entertainment loop

BIGO’s observable flow is simple: discover stream → enter room → chat/react → send gift → gain recognition → return. BIGO’s gift guide says gifts can affect streamer rankings and supporter recognition, which turns gifting into both appreciation and status.

**AfriStage version**

```text
Open app
→ See live rooms
→ Join creator
→ Chat/react
→ Send gift
→ Appear as supporter
→ Follow creator
→ Return for next live
```

**Build priority**

```text
P0: live feed, room join, chat, gifts, top supporter display
P1: follow notifications, gift history, creator shoutout prompts
P2: supporter ranks, fan badges, weekly supporter board
```

---

### Loop B — Creator earning loop

BIGO publicly describes the creator earning loop as viewers buying Diamonds, sending gifts, creators receiving Beans, and eligible creators withdrawing cash. BIGO’s user agreement also describes Diamonds, Gifts, Beans, and withdrawal eligibility for users who meet age/jurisdiction requirements.

**AfriStage version**

```text
Creator approved
→ Creator goes live
→ Viewers send coin gifts
→ Ledger records creator earnings
→ Fraud/payout hold checks run
→ Creator requests payout
→ Admin reviews payout
→ Creator receives local payout
```

**Build priority**

```text
P0: creator approval, gift ledger, wallet, payout request, admin payout review
P1: payout risk flags, payout method management, reconciliation
P2: creator earning analytics, monthly statements
```

---

### Loop C — Competition loop

BIGO’s public feature descriptions explain PK battles as two creators competing on split screen, with audience gifts contributing to the score and last-second “snipe” behaviour creating urgency.

**AfriStage version**

```text
Two creators enter battle
→ Viewers pick side
→ Gifts increase score
→ Timer creates urgency
→ Winner gets ranking boost/reward
→ Clips/highlights promote next battle
```

**Africa adaptation**

Start with structured, culturally strong formats:

```text
Afrobeats vs Amapiano
Lagos vs Accra comedy
Dance battle
Campus talent battle
Diaspora support night
Gospel praise challenge
```

**Priority**

```text
P2 only — not before core wallet/gift/moderation loop is stable.
```

---

### Loop D — Community/family loop

BIGO’s public family guide describes Families as groups with combat points, family levels, member levels, rankings, gifts, tasks, and rewards.

**AfriStage version**

```text
Creator joins/creates Circle
→ Members support each other’s rooms
→ Circle earns points from gifts/tasks
→ Circle appears on regional leaderboard
→ Circle unlocks events/perks
```

**Africa adaptation**

```text
City Circles
Campus Circles
Diaspora Circles
Music-label Circles
Comedy-house Circles
Faith/community Circles
```

**Priority**

```text
P2/P3 — powerful, but dangerous if introduced before moderation, fraud, and payout controls are mature.
```

---

## 3. Feature priority map

### P0 — Must exist before closed beta

| Feature                     | Reason                       |
| --------------------------- | ---------------------------- |
| Live rooms                  | Core product                 |
| Live chat                   | Core engagement              |
| Wallet/coins                | Monetisation base            |
| Gifts                       | Creator economy base         |
| Creator approval            | Quality/safety gate          |
| Payout request/admin review | Trust and creator motivation |
| Reports/moderation          | Safety requirement           |
| Support tickets             | Payment/payout/user trust    |
| Ledger integrity            | Financial correctness        |
| Admin dashboard             | Operational control          |

### P1 — Strong beta differentiators

| Feature               | Reason                            |
| --------------------- | --------------------------------- |
| Better home discovery | More room joins                   |
| Follow creator        | Retention                         |
| Notifications         | Return loop                       |
| Leaderboards          | Status competition                |
| Audio rooms           | Low-data African market advantage |
| Guest seats           | More social interaction           |
| Gift ranking          | More gifting motivation           |
| Creator analytics     | Creator retention                 |

### P2 — Growth/retention systems

| Feature            | Reason                          |
| ------------------ | ------------------------------- |
| PK battles         | High engagement and gift spikes |
| Creator Circles    | Community retention             |
| Daily missions     | Habit formation                 |
| Events             | Campaign spikes                 |
| Local discovery    | Regional relevance              |
| Fan badges         | Loyalty identity                |
| Limited-time gifts | Event monetisation              |

### P3 — Advanced scale systems

| Feature               | Reason                               |
| --------------------- | ------------------------------------ |
| Agencies              | Creator supply scaling               |
| AR filters            | Creator confidence and entertainment |
| Game streaming        | Category expansion                   |
| AI recommendations    | Personalisation                      |
| Brand campaigns       | Enterprise monetisation              |
| Creator subscriptions | Recurring revenue                    |

---

## 4. AfriStage Africa-specific adaptation matrix

| BIGO mechanic   |        Direct copy risk | AfriStage adaptation                               |
| --------------- | ----------------------: | -------------------------------------------------- |
| Diamonds        |                  Medium | Use **Coins** with transparent local pricing       |
| Beans           |                  Medium | Use **Creator Earnings** ledger, not “Beans”       |
| PK battle       |              Low/medium | Use **Stage Battles** with African content formats |
| Families        |                  Medium | Use **Creator Circles**, not same naming/rules     |
| Fan clubs       |                     Low | Use **Supporter Circles** or **Inner Stage**       |
| Nearby          |                     Low | Use privacy-safe **Local Stage**                   |
| Task center     |                     Low | Use **Daily Missions**                             |
| Gift animations | High if copied visually | Create original African-inspired gifts/effects     |
| Leaderboards    |                     Low | Use regional/category charts                       |
| Agency program  |              Low/medium | Use vetted partner programme with local compliance |
| Beauty filters  |                  Medium | Use generic camera enhancements, original assets   |
| App layout      |             Medium/high | Use original AfriStage design system               |

---

## 5. Technical systems implied by BIGO-style mechanics

| Product system   | Backend services needed                                        | Frontend surfaces needed                     |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Live rooms       | live-room service, stream token service, participant tracking  | home feed, live room, host screen            |
| Chat             | websocket gateway, message persistence, mute controls          | chat overlay, input, history                 |
| Gifts            | gift catalog, wallet debit, creator credit, ledger transaction | gift drawer, gift animation, balance display |
| Wallet           | coin account, earnings account, transaction ledger             | wallet screen, payment history               |
| Payouts          | payout request, review workflow, payment status, audit         | creator payout UI, admin payout queue        |
| PK battles       | battle session, scoring, timer, score events                   | split-screen battle UI, score bar            |
| Leaderboards     | aggregation jobs, rankings, time windows                       | creator charts, supporter ranks              |
| Families/Circles | group model, membership, points, tasks                         | circle profile, member list, circle ranking  |
| Events           | event config, event gift catalog, event leaderboard            | event hub, campaign cards                    |
| Moderation       | reports, severity scoring, room/user actions                   | report modal, admin moderation queue         |
| Agencies         | agency profiles, creator assignment, commissions               | partner dashboard, admin agency controls     |
| Tasks            | mission definitions, progress tracking, rewards                | daily mission screen                         |
| Notifications    | push/event triggers, templates, preferences                    | notification inbox, push notifications       |

---

## 6. BIGO-to-AfriStage implementation roadmap

- **R1 — Product reverse-engineering matrix** (this doc): feature map, product loops, MVP priority, Africa adaptation, technical implication map.
- **R2 — BIGO UX flow teardown**: viewer/creator/gift/PK/family/agency/cashout/report flows + admin inference. *(see `R2-ux-flow-teardown.md`)*
- **R3 — Monetisation system teardown**: currency model, gift catalog logic, ranking incentives, creator earnings, payout controls, event monetisation, VIP/fan-club monetisation. *(see `R3-monetisation-teardown.md`)*
- **R4 — Community/growth system teardown**: families, fan clubs, agencies, events, missions, leaderboards, nearby, notifications. *(see `R4-community-growth-teardown.md`)*
- **R5 — Architecture inference**: streaming, realtime chat, wallet/ledger, recommendation, moderation, event/ranking, agency/creator. *(see `R5-architecture-inference.md`)*

---

## 7. What AfriStage should copy vs avoid

### Copy the principle

```text
Live rooms as the core surface
Gifts as the monetisation loop
Creators as earners
Supporters as status-seekers
Events as activity spikes
Leaderboards as social proof
Communities as retention engines
Admin moderation as safety backbone
```

### Do not copy literally

```text
BIGO branding
BIGO gift names/assets
Diamonds/Beans naming
exact UI layout
exact reward formulas
exact agency contracts
exact family mechanics
private APIs
APK logic
proprietary moderation rules
```

---

## 8. Strategic conclusion

BIGO is not just a live-streaming app. It is a **creator monetisation machine** built from repeated loops:

```text
attention
→ interaction
→ gifting
→ recognition
→ creator earnings
→ competition
→ community identity
→ return visits
```

AfriStage should not try to clone the surface only. The real thing to reverse-engineer is the **system of incentives**.

The correct AfriStage build order is:

```text
1. Live rooms
2. Chat
3. Gifts
4. Wallet/ledger
5. Creator approval
6. Payouts
7. Moderation/admin
8. Discovery
9. Leaderboards
10. Events
11. Battles
12. Creator Circles
13. Agencies
```

That keeps the project legal, focused, and commercially realistic.

---

## Sources

- BIGO Live app features — https://www.bigo.tv/blog/bigo-live-app-features
- How to send gifts on BIGO Live — https://www.bigo.tv/blog/bigo-live-virtual-gifts
- How to join or create a Family on BIGO Live — https://www.bigo.tv/blog/bigo-live-family
