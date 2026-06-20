# Phase 3.6 — Beta Launch Operations

## Objective

Run the AfriStage closed beta as a controlled operation. Phase 3.5 proved the core flows; Phase 3.6 defines who is allowed in, what operators check every day, how incidents are handled, and which gates block launch.

## Launch Gate Commands

Local preflight without a live API smoke:

```bash
npm run launch:beta
```

Full live-stack rehearsal:

```bash
npm run launch:beta:live
```

Production launch gate:

```bash
npm run launch:production
```

Use the live gate only after Postgres, Redis, LiveKit, API, and seeded beta accounts are running.

## Invite rollout

| Wave | Audience | Size | Entry criteria | Stop condition |
|---|---:|---:|---|---|
| 0 | Internal team | 3-5 | Admin, viewer, creator accounts validated | Any Critical issue |
| 1 | Trusted creators | 5-10 | Creator approval and go-live rehearsal complete | More than 2 High issues in one day |
| 2 | Viewer testers | 25-50 | At least 3 creators scheduled to go live | Gift, wallet, or report flow failure |
| 3 | Expanded closed beta | 100-250 | 3 stable beta days, no open Critical issues | Ledger, payout, payment, or moderation incident |

Invite rules:

- Issue invite codes from Admin → Beta Invites only.
- Tag every invite with user group, wave, owner, and expected first session date in the beta tracker.
- Do not invite a new wave until the previous wave has one full operating day with no Critical issues.
- Revoke unused or leaked invites immediately.

## Daily operating rhythm

| Time | Owner | Action | Evidence |
|---|---|---|---|
| Start of day | Ops lead | Run `npm run launch:beta:live` against the beta stack | Command output |
| Start of day | Admin operator | Check Dashboard, Beta Ops, Live Rooms, Reports, Payouts, Ledger Integrity, Support | Screenshot or notes |
| Before creator sessions | Creator ops | Confirm approved creator status, scheduled room title/category/language, LiveKit config | Creator checklist |
| During live sessions | Moderator | Watch Reports and Live Rooms queues | Action log |
| After live sessions | Finance ops | Check wallet movement, gift volume, payout requests, ledger integrity | Admin screenshot |
| End of day | Ops lead | Review support backlog, incidents, open Critical/High issues, next-wave decision | Daily beta note |

## Launch freeze gates

Do not invite or expand beta users when any condition is true:

- `npm run launch:beta:live` fails.
- Ledger integrity is imbalanced.
- Any payout is paid twice, editable after paid, or missing audit trail.
- Mock payments are enabled in production.
- `REQUIRE_ADMIN_MFA=true` is not set for production admin access.
- Seed/demo accounts can log into production.
- LiveKit stream join/start fails for creator or viewer.
- Support internal notes are visible to users.
- Critical report categories do not appear in the admin queue.
- Open Critical or unresolved money/safety High issue exists.

## Incident playbooks

### Ledger imbalance

Impact: Critical money integrity incident.

1. Stop payout approvals immediately.
2. Screenshot Admin → Ledger Integrity.
3. Export affected transaction IDs from the admin table or API response.
4. Identify the source flow: payment, gift, payout, reversal, or manual admin action.
5. Do not edit posted ledger rows manually.
6. Restore balance with an explicit reversal/correction transaction.
7. Rerun `npm run launch:beta:live`.
8. Record incident, root cause, correction transaction ID, and prevention action.

### Payment credit failure

Impact: High unless duplicate or incorrect credit occurs, then Critical.

1. Check Admin → Payments for provider status, webhook state, reference, and user.
2. Check user wallet history.
3. If provider succeeded but wallet did not credit, hold manual correction until ledger path is understood.
4. If duplicate credit is suspected, freeze wallet adjustment and inspect idempotency key/reference.
5. Reply to support ticket with user-safe status only.

### Payout risk or failed payout

Impact: Critical if money moved incorrectly.

1. Hold payout in Admin → Payouts with a reason.
2. Check Ledger Integrity before approval.
3. Confirm creator available earnings and payout hold.
4. Reject with a reason if the account or wallet state is unsafe.
5. Mark paid only after external transfer confirmation.
6. Confirm audit log entry exists.

### Live room abuse

Impact: High or Critical depending on harm.

1. Find room in Admin → Live Rooms.
2. Review related Reports by priority/reason.
3. Suspend room when immediate risk exists.
4. Ban/suspend user only when evidence supports it.
5. Confirm live room UI shows ended/suspended state.
6. Record moderation reason and audit log ID.

### LiveKit or realtime failure

Impact: High if a live session cannot proceed.

1. Check `/api/health` and LiveKit service health.
2. Confirm creator start returns `hostToken` and `livekitUrl`.
3. Confirm viewer join token works.
4. Confirm Socket.IO chat joins `/chat`.
5. Move creator session to backup time if failure persists for more than 10 minutes.

### Support backlog spike

Impact: Medium to High depending on category.

1. Sort Admin → Support by priority and type.
2. Handle payment/payout/moderation first.
3. Assign every open ticket before end of day.
4. Use public replies for user-visible updates.
5. Keep internal notes private and operational.

## Support handling

Support SLA during beta:

| Type | First response | Resolution target |
|---|---:|---:|
| Payment | 4 hours | 1 business day |
| Payout | 4 hours | 2 business days |
| Moderation/safety | 1 hour | Same day |
| Creator application | 1 business day | 2 business days |
| Technical | 1 business day | Best effort during beta |

Every support ticket needs a category, owner, status, next action, and user-safe reply when waiting longer than the SLA.

## Beta success metrics

Track daily:

| Metric | Why it matters |
|---|---|
| Invite acceptance rate | Measures rollout quality |
| Viewer first live-room join time | Measures discovery clarity |
| Creator go-live success rate | Measures creator readiness |
| Chat/reaction/gift event success | Measures core live engagement |
| Gift conversion | Measures wallet/gift trust |
| Failed payment rate | Measures money-flow reliability |
| Payout review time | Measures finance operations load |
| Critical report response time | Measures safety readiness |
| Support ticket volume by type | Measures beta friction |
| Ledger integrity status | Blocks all money movement when unhealthy |

## Feedback triage

Use the Phase 3.5 feedback schema. Triage order:

1. Critical money, safety, auth, data exposure, or blank-screen issues.
2. High broken core flows.
3. Medium confusion or recoverable friction.
4. Low polish.

No new feature work enters beta unless Critical/High launch blockers are cleared.

## Production readiness flags

Before real users:

- `REQUIRE_ADMIN_MFA=true`
- `ENABLE_MOCK_PAYMENTS` unset or not `true`
- `ALLOW_SEEDED_PROD_LOGIN` unset or not `true`
- Paystack secret configured and not placeholder
- LiveKit URL/key/secret configured and not placeholder
- Seed/demo accounts removed or blocked in production
- Admin cookie secure over HTTPS
- Terms and Privacy URLs configured for admin and mobile auth surfaces
- Payout approvals staffed by an accountable operator

## Closeout

Phase 3.6 is complete when:

- Internal Wave 0 and creator Wave 1 complete without open Critical issues.
- `npm run launch:beta:live` passes on launch day.
- Daily operating rhythm is assigned to named owners.
- Incident log, support queue, and feedback tracker are active.
- Next invite wave has an explicit go/no-go decision.
