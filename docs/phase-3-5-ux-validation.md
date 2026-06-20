# Phase 3.5 — UX Validation and Beta Readiness

## Objective

Validate that closed-beta users can complete AfriStage's core journeys without confusion, raw technical errors, or trust breakdowns. This phase does not add product surface area; it proves the current viewer, creator, wallet, payout, moderation, support, and admin flows are ready to test with real users.

## Readiness Commands

Run the deterministic UX gate first:

```bash
npm run validate:ux-readiness
```

Run the backend closed-beta control loop against a live local stack:

```bash
npm run smoke:closed-beta
```

Run admin build validation:

```bash
npm run build -w apps/admin-web
```

Run mobile validation:

```bash
cd apps/mobile
flutter analyze
flutter test
```

## Core Journeys

| Journey | Target | Pass gate |
|---|---:|---|
| Viewer joins live room | Under 30 seconds | Home clearly shows live rooms; room has video, chat, gift, report, reconnect, and ended states. |
| Viewer sends chat | Under 10 seconds | Chat input is visible when connected and explains reconnect, muted, suspended, or ended states. |
| Viewer sends gift | Under 60 seconds | Gift drawer shows coin balance, price, insufficient coin state, and send feedback. |
| Creator starts room | Under 45 seconds | Creator status is clear; approved creators can open setup and start room. |
| Creator requests payout | Under 45 seconds | Earnings, payout hold, and payout request action are separated from viewer coins. |
| User creates support ticket | Under 45 seconds | Support category, subject, description, ticket list, and retry state are visible. |
| Admin reviews payout | Under 30 seconds | Payout queue shows ledger warning, risk flags, reason-required hold/reject, and paid confirmation. |
| Admin handles report | Under 15 seconds | Report queue supports priority/reason filtering and suspend/escalate actions. |
| Admin checks ledger | Under 10 seconds | Ledger integrity page states balanced/imbalanced status and required action. |

## Manual Test Protocol

Test with three users: viewer, approved creator, and admin operator. Capture timings from first visible screen to completed action.

1. Viewer: login, browse home, join room, connect video, send chat, react, open gifts, send gift, report room, leave room.
2. Creator: login, confirm approval status, open creator dashboard, start room, confirm camera/mic state, view chat/gifts, mute a viewer, end room, request payout.
3. Wallet: buy coins with mock flow, confirm balance credit, send gift, confirm coin deduction, review history, test insufficient coins and failed payment messaging.
4. Payout: request payout, review it in admin, hold/reject with reason, approve, mark paid with confirmation, confirm audit log and ledger integrity.
5. Support: create ticket, triage in admin, add public reply and internal note, resolve, confirm internal note is not user-visible.
6. Accessibility: keyboard through admin pages, verify visible focus, test small mobile viewport, large text, low brightness, and status text that does not rely on color alone.

## Feedback Capture

Each beta finding must include:

| Field | Required |
|---|---|
| User type | Viewer, Creator, Admin |
| Flow | Auth, Feed, Live Room, Wallet, Gift, Payout, Report, Support, Admin |
| Severity | Critical, High, Medium, Low |
| Screen | Route or mobile screen |
| Description | What the user experienced |
| Steps | Exact reproduction path |
| Expected | What should happen |
| Actual | What happened |
| Evidence | Screenshot, recording, console/log excerpt |
| Owner | Product, Mobile, Admin Web, API, Ops |
| Status | Open, In progress, Fixed, Deferred |

Severity rules:

| Severity | Meaning |
|---|---|
| Critical | Blocks beta, creates money risk, safety risk, or data exposure. |
| High | Breaks a core viewer, creator, wallet, payout, support, or admin flow. |
| Medium | Causes confusion, delay, unclear status, or recoverable friction. |
| Low | Visual polish, copy refinement, or non-blocking ergonomic issue. |

## Beta Exit Criteria

- `npm run validate:ux-readiness` passes.
- `npm run smoke:closed-beta` passes against the live local stack.
- `npm run build -w apps/admin-web` passes.
- `flutter analyze` and `flutter test` pass.
- No core mobile screen exposes raw `snapshot.error` or framework exception text.
- Dangerous admin actions require confirmation or disabled states.
- Ledger integrity is visible before payout approval.
- Support internal notes remain private.
- Top Critical and High usability blockers are fixed or explicitly blocked with owner and date.
