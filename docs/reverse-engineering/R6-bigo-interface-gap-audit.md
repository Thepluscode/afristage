# R6 — BIGO interface gap audit

Date: 2026-07-29

## Premise

The references are useful only if their interaction patterns improve an
AfriStage workflow backed by real product state. Copying visible BIGO controls
without the media, entitlement, safety, or money system behind them would make
the interface less trustworthy.

## Seven-reference decision record

| Reference | Observed pattern | Decision |
|---|---|---|
| 1 | PK battle, score split, combo gift, full-screen gift animation | Keep `PLANNED`. PK requires two-host media orchestration, battle lifecycle, scoring, moderation, and recovery. The existing top-gifter aggregate can later supply score, but is not a battle system. |
| 2 | Full-screen camera with beauty/face effects | Keep `PLANNED`. Requires a proven capture/effects SDK, device-performance budget, privacy review, and physical-device testing. |
| 3 | Daily tasks and real-time heat leaderboard | Adopted. The room now opens a real-time heat sheet backed by room top gifters and the viewer's real supporter-tier standing, with routes to existing missions and events. |
| 4 | Mode-led discovery and dense two-column live grid | Adopted. Featured keeps server ranking, Popular uses current viewers and room gift totals, Nearby uses the viewer's profile country, and Explore diversifies categories. Category filters and search remain available. |
| 5 | Gift catalogue tabs, event gifts, quantity multipliers, balance and send total | Adopted. Popular/Recent/Events are derived from the live catalogue and session sends; `eventId` drives event badges. Presets `1/10/99/188/999` plus a bounded custom quantity calculate the total before Send. |
| 6 | In-room wealth level and progress | Adopted as supporter standing, not synthetic VIP. The sheet shows the real tier, cumulative coins, next tier, and coins remaining from `/creators/:creatorId/supporters/me`. |
| 7 | Supporter strip, live chat, reactions, gift action and event/status shortcuts | Existing room primitives retained; the supporter strip and new Heat action now open the standing/leaderboard surface. Guest seats remain `PLANNED` because multi-guest LiveKit orchestration does not exist. |

## Implemented viewer workflow

`Live tab → discovery mode/category → room → Heat/standing → gift catalogue → category → gift → quantity/total → server-validated send`

The Wallet shortcut is a real navigation path. Gift pricing, event availability,
balance enforcement, creator split, and idempotency remain server-authoritative.
The client quantity bound mirrors the API bound (`1..10,000`).

## Failure and safety behaviour

- Missing country only disables Nearby; global discovery remains available.
- Missing supporter standing leaves the room and heat leaderboard usable.
- Empty event/recent categories are not shown.
- An unaffordable total disables Send before the request.
- The server revalidates room state, gift availability, quantity, wallet
  balance, and idempotency.
- A wallet refresh failure after a successful gift no longer reports the
  transaction as failed; the send remains successful and the viewer is told the
  balance will refresh.
- PK, multi-guest, face effects, VIP/SVIP, and incognito were not represented by
  decorative controls because their underlying contracts do not exist.

## Evidence and build-standard assessment

- `flutter analyze`: clean.
- Full mobile suite: 357 tests passed. Focused tests cover wallet navigation,
  post-send refresh failure, discovery locality, event gift filtering, quantity
  payload, and room heat.
- Deterministic 390×844 renders:
  `mobile-captures/live-discover.png`,
  `mobile-captures/live-room.png`, and
  `mobile-captures/live-room-heat.png`.
- Correct: each adopted control maps to a real API or deterministic local
  filter, and the chosen gift quantity reaches the API payload.
- Reliable: empty/error/insufficient-balance paths degrade without fabricating
  success or failure.
- Efficient: no new service or database model; discovery operates over the
  existing bounded feed and heat reuses existing aggregates.
- Effective: the three largest visible gaps in the references—discovery
  density, gift decision controls, and recognition/status—are now present in
  the core viewer journey.

Local automated and rendered evidence is not device or deployed verification.
