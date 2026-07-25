# Phase 3.6 — Beta Launch Operations

## Objective

Run the AfriStage closed beta as a controlled operation. Phase 3.5 proved the core flows; Phase 3.6 defines who is allowed in, what operators check every day, how incidents are handled, and which gates block launch.

## Beta GO / NO-GO checklist

Run top to bottom before inviting anyone. **One unchecked Blocker = NO-GO.** Verify each
against evidence — don't assume. State column is today's status.

### A. Blockers — every one must be ✅
| # | Check | How to verify | State |
|---|---|---|---|
| 1 | Launch gate passes | `npm run launch:beta:live` exits 0 (needs Postgres/Redis/LiveKit/API up) | ⬜ run at launch |
| 2 | Ledger integrity green | `curl -s $API/metrics \| grep -E 'ledger_integrity_ok 1\|ledger_unbalanced.* 0'` | ✅ staging |
| 3 | Outside-in monitor **scheduled + seen to fire** | `.github/workflows/synthetic-check.yml` runs `tools/monitoring/beta-uptime.sh` every 5 min; confirm a real Slack alert arrived (point it at a bad URL once) | 🟡 wired — needs **Actions billing on** OR an external uptime ping to actually run; set repo secret `ALERT_WEBHOOK` |
| 4 | Real payments (only if real money flows) | `PAYSTACK_SECRET_KEY` set + one live card purchase credits coins; OR the beta is coins-free / mock-only | ⬜ staging = test key → 502 |
| 5 | Admin can enable creator payouts + approvals staffed | `POST /api/admin/creators/:id/payout {enabled:true}` (verified #208) + an accountable operator on payout approvals | ✅ #208 (endpoint) |
| 6 | No prod footguns | `REQUIRE_ADMIN_MFA=true`, `ENABLE_MOCK_PAYMENTS` unset, `ALLOW_SEEDED_PROD_LOGIN` unset, admin cookie secure (see **Production readiness flags**) | ⬜ pending |

### B. Should-have — warn, not blocking for a small hand-supported beta
- `RESEND_API_KEY` set — else password-reset/email ships dark (recovery is admin-assisted, OK only while support can hand-verify identity). **Becomes a Blocker** for any wave too large to hand-verify.
- Support playbooks linked + on-call assigned (this doc's **Incident playbooks**).
- Self-serve KYC gap acknowledged — creators are hand-approved for payout (fine at beta scale).

### C. Decisions to record before inviting
- **Distribution channel:** hosted flutter-web (live) / Android internal testing / native store (native **not operational** — see `docs/mobile-release.md`).
- **Wave size vs. support capacity** — drives whether the B items become Blockers.
- **Money mode:** real payments (needs A#4) vs. a coins-free demo beta.

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
| End of day | Ops lead | Review Admin → User Activity: personally reach out to every QUIET user (was active, now 3+ days silent with 0 meaningful actions this week) before they churn — this is manual re-engagement at beta scale, not automation | Outreach note per quiet user |
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

## Outside-in health monitoring

The in-API `@Cron`s (revenue alert #185, payment synthetic #191, ledger-integrity)
are blind to their own host: if the API crashes or a deploy never goes healthy,
they die with it. `tools/monitoring/beta-uptime.sh` runs **off** the API host and
probes the deployed public API — so it catches exactly that.

Checks (each a real probe of the deployed URL): `/api/health` 200 + `"status":"ok"`,
`/live-rooms` 200 (the beta's core public read), `/metrics` contains
`afristage_ledger_integrity_ok 1` (money integrity). Any failure POSTs Slack (via the
bundled `synthetic_check.py`) and exits 1 so a scheduler flags it.

```bash
# one probe (set the webhook to actually alert):
UPTIME_ALERT_WEBHOOK_URL=https://hooks.slack.com/... \
  bash tools/monitoring/beta-uptime.sh
bash tools/monitoring/beta-uptime.sh --selftest   # verify detection without alerting
```

**Schedule it (pick one — a monitor that isn't scheduled is not a monitor):**
- **Recommended always-on ping:** point a **free external uptime service**
  (UptimeRobot / BetterStack) at `/api/health`. It's truly off-platform, so it also
  catches a Railway-wide outage this script can't see from Railway.
- **The deep check** (health + live-rooms + ledger): run `beta-uptime.sh` every ~5 min
  from a laptop/server `cron`, a **Railway cron service**, or a GitHub Action (once
  Actions billing is on) — with `UPTIME_ALERT_WEBHOOK_URL` set.

**Limitation (honest):** a single-region checker on the same platform can't detect a
total-Railway outage — pair it with the off-platform ping above.

## Support tiers

Every ticket lands in exactly one tier. The tier decides who acts, not how urgent it feels.

**Tier 1 — automated/scripted resolution.** Known issue, documented fix, safe +
idempotent + already exposed via an admin endpoint. During beta this tier starts
EMPTY on purpose: automating resolutions before real ticket volume means
automating guesses. After ~2 weeks of beta tickets, promote recurring Tier-2
resolutions here (candidates: session revoke for "logged in on a lost phone",
re-run of the stale-room sweep). Everything not explicitly promoted stays Tier 2.

**Tier 2 — assisted triage (default).** Unknown or judgment-required issue. The
operator (or agent) packages context and escalates with a recommendation. An
escalation package always contains: the `x-request-id` (every API response
carries one; JSON logs are searchable by `requestId`), the user id + role, a
timeline of what the user did, and which playbook rows were already ruled out.
Resolution feeds back into the playbook the same week.

**Tier 3 — incident response.** Multiple users affected, or money, security, or
data integrity involved. Execute the matching incident playbook below. Sequence:
(1) contain first (stop payouts / suspend room / revoke sessions), (2) notify the
ops lead immediately, (3) user-safe status replies only — never internal detail,
(4) record incident, root cause, and prevention action before the next invite wave.

## Incident playbooks

### Login / auth failures

Impact: Medium per user; Critical if many users or an admin account is affected.

Every login failure returns a distinct message — diagnose from what the user
reports seeing. Login body is `{identifier, password}` (+ `mfaToken` when MFA
is on); `identifier` is email OR phone.

| User sees | Cause | Diagnosis | Resolution | Tier |
|---|---|---|---|---|
| "Invalid credentials" | Unknown identifier or wrong password | `select id, email, phone, status from users where email='X' or phone='X';` — distinguish no-such-account from wrong password | Verify identity out-of-band, then `POST /api/admin/users/:id/password-reset-token` (audited; returns a one-time token, 15 min TTL). User sets a new password at `POST /api/auth/password-reset/confirm {token, newPassword}` — this also signs them out everywhere | 2 |
| "User is not active" | Account SUSPENDED/BANNED | `select status from users where id='U';` + check Admin → audit logs for the moderation action | If suspension was wrong: `POST /api/admin/users/:id/reactivate` (moderation, audited). If correct: user-safe reply, no detail | 2 |
| "MFA token required" / "Invalid MFA token" | MFA on; missing/wrong/expired TOTP | TOTP accepts ±30s clock skew already — a "wrong code" that persists means wrong device clock or wrong account entry in the authenticator | Ask user to check device auto-time. Recovery codes (8, one-time) work in the `mfaToken` field. Lost device AND codes: verify identity out-of-band, then `POST /api/admin/users/:id/mfa-reset` — ROTATES the secret + recovery codes (never disables MFA, so no `REQUIRE_ADMIN_MFA` lockout) and signs the account out everywhere; hand the returned otpauth URL + codes to the user | 2 |
| "MFA setup required for this account" | Privileged role + `REQUIRE_ADMIN_MFA=true` without MFA enrolled | `select role, mfa_enabled from users where id='U';` | Expected behavior. User must log in from an already-authenticated session and run `POST /api/auth/mfa/setup` + `mfa/enable`; if fully locked out, see MFA gap below | 2 |
| "Seeded test accounts are disabled in production" | `admin/creator/viewer@afristage.local` in prod | — | Expected. Real accounts only in prod (`ALLOW_SEEDED_PROD_LOGIN` must stay unset) | 1 (reply template) |
| 429 Too Many Requests | Auth throttle: 10 req/min/IP (global default 100) | Check JSON logs for the IP: repeated `POST /api/auth/login` completions | Self-resolves in 60s. Many DIFFERENT users behind one IP (campus/office NAT) hitting it → escalate as a limits decision | 2 |
| Session dies / logout loops | Refresh rejected: "revoked" (sign-out-everywhere), "signed out" (device revoked), "superseded" (rotation — client double-fired refresh or token theft), "Account is not active" | `GET /api/admin/users/:id/sessions` for live sessions; grep logs by `requestId` for which rejection fired | Revoked/superseded: user logs in again (by design). Repeated "superseded" from one client → mobile refresh race, file a bug. Suspected theft: `POST /api/admin/users/:id/sessions/revoke-all` (audited) | 2 |
| Works then fails after ~15 min | Client not refreshing (access TTL 15m, refresh 30d) | One user: client/device bug. All users: check `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` env, recent deploy | Single user: reinstall/re-login. All users: Tier 3 — config regression | 2/3 |

**Known gaps (do not improvise fixes):**

- **Self-service password reset ships DARK.** `POST /api/auth/password-reset/request`
  exists (non-enumerating, always `{ok:true}`) and beta invites auto-email their
  codes — but nothing is delivered until `RESEND_API_KEY` is set (`EMAIL_FROM`
  optional). Until then recovery stays admin-assisted via the endpoints above.
  Setting the key is the entire remaining work — REQUIRED before any wave too
  large for support to hand-verify identity.
- **No per-account lockout counter** — brute-force control is the per-IP
  throttle only (deliberate). A targeted slow attack across IPs is bounded by
  bcrypt cost 12; revisit at scale.

### Go live (creator) / Watch (viewer)

Customer-symptom table for the core streaming flow. Every row is a distinct throw
in `live-rooms.service` / the guest-token path.

| User sees | Cause | Diagnosis | Resolution | Tier |
|---|---|---|---|---|
| Creator: "Only creators can create live rooms" | Account is a viewer, not a creator | `select role from users where id='U';` + `select approval_status from creator_profiles where user_id='U';` | User applies (`POST /api/creators/apply`), then approve in Admin → Creators (`POST /api/admin/creators/:userId/approve`, audited) | 2 |
| Creator: "Creator approval required before going live" | creatorProfile exists but `approval_status ≠ APPROVED` | `select approval_status, kyc_status from creator_profiles where user_id='U';` | Review the application; `POST /api/admin/creators/:userId/approve`. If rejected on purpose, reply with the reason | 2 |
| Creator/viewer: "User is not active" | Account SUSPENDED/BANNED | `select status from users where id='U';` + Admin → audit logs | Same as auth "User is not active" — `POST /api/admin/users/:id/reactivate` if wrong | 2 |
| Viewer: stream won't load / no video (no guest token) | Room isn't LIVE (`POST /live-rooms/:id/guest-token` is LIVE-only) or it ended | `select status from live_rooms where id='R';` — SCHEDULED/ENDED → no token, by design | Not an error if the stream simply ended. Host crashed → the room-cleanup sweep ends the stuck room; ask the host to restart | 1/2 |
| All viewers: can't join a LIVE room / black video | LiveKit token or service failure | `/api/health` + LiveKit health; confirm host start returned `hostToken`+`livekitUrl`; check `LIVEKIT_*` env after any deploy | Follow **LiveKit or realtime failure** (Tier 3) below; move the session if >10 min | 3 |

### Buy coins

Every row is a throw in `payments.service` (plus the two operational realities: a test key in staging, and webhook lag).

| User sees | Cause | Diagnosis | Resolution | Tier |
|---|---|---|---|---|
| "A verified email is required for card payments" | Card intent, phone-only account has no email | `select email from users where id='U';` | User adds an email, then retries | 1 (reply) |
| Checkout won't open / 502 on card init | Provider not configured, or a **test** key in staging | `select checkout_url, provider, status from payment_intents where id='I';` + confirm the market's key (NGN→Paystack, USD→Stripe) | Prod: set the real key. Staging: expected with the test key — use the mock path | 2/3 |
| "<provider> is not configured" | Payment provider env missing for that currency | check the provider keys for the package's market | Set the missing key; until then that market can't buy | 3 |
| "I paid but no coins arrived" | Webhook lag or a lost webhook | `select status from payment_intents where id='I';` — PENDING while the provider shows paid | The reconciliation sweep (#177) re-verifies + credits via the SAME idempotent path; or `POST /api/payments/coin-purchase-intents/:id/verify` (pull-verify). **Never hand-credit** — double-credit risk | 2 |
| Duplicate coins credited | Double/retried webhook | idempotency key + reference in Admin → Payments | Freeze the wallet; follow **Payment credit failure** (Tier 3). Credit path is idempotent by design, so investigate how it happened | 3 |

### Send a gift

Every row is a throw in `gifts.service` / `money.service`. Note: a failed gift throws **before** the ledger post, so **no coins move** — reassure the user.

| User sees | Cause | Diagnosis | Resolution | Tier |
|---|---|---|---|---|
| "Not enough coins" | Wallet COIN balance < gift price × quantity | `GET /api/wallet/me` (as user) or `select balance_minor from wallet_accounts where user_id='U' and account_type='COIN';` | Expected — user buys more coins. If they DID buy and it's wrong, see the Buy-coins rows | 1 (reply) |
| "Room is not live" | Gifting a SCHEDULED/ENDED room (race as the stream ends) | `select status from live_rooms where id='R';` | Expected once a stream ends — no coins were lost | 1 (reply) |
| "You cannot gift yourself" | Host gifted their own room | — | Expected guard | 1 (reply) |
| "Gift not found" / "only available during its event" | Gift deactivated, or an event-limited gift outside its window | `select is_active from gifts where id='G';` | If it should be active, re-enable in Admin → Gifts | 2 |
| Gift sent but creator got no diamonds | Ledger/split anomaly | Admin → Ledger Integrity; trace the gift's `ledgerTransactionId` | Follow **Ledger imbalance** (Tier 3) — the split is one balanced txn, so a partial should be impossible | 3 |

### Request a payout

Every row is a throw in `payouts.service`. Payout moves EARNING (diamonds) → PAYOUT_HOLD.

| User sees | Cause | Diagnosis | Resolution | Tier |
|---|---|---|---|---|
| "Payout not enabled" | `payout_enabled=false` or `kyc_status ≠ APPROVED` | `select payout_enabled, kyc_status from creator_profiles where user_id='U';` | Admin enables: `POST /api/admin/creators/:userId/payout {enabled:true}` — sets `payout_enabled` + `kyc_status=APPROVED`, audited (`CREATOR_PAYOUT_ENABLED`). Self-serve KYC is still backlog | 1/2 |
| "Below minimum payout threshold" | coinAmount < `MIN_PAYOUT_COIN` (default 500) | — | Expected — creator accrues more diamonds first | 1 (reply) |
| "Insufficient earnings" | Requested > available EARNING; a pending payout holds funds | `GET /api/wallet/me` `earningBalance` vs `payoutHoldBalance` | Expected. If /earnings shows more, a prior payout is holding it — explain | 1/2 |
| "Invalid payout method" | `payoutMethodId` not theirs / deleted | `select id from payout_methods where user_id='U';` | User re-adds a method (`POST /api/payouts/methods`) | 1 (reply) |
| "Idempotency key already used" / "reused with a different amount" | Client double-fired the request | grep logs by `requestId` | The first request stands; no double-hold. Repeated → client bug, file it | 2 |
| Payout stuck / "Illegal payout transition …" | Admin action out of order (approve/reject/mark-paid) | `select status from payout_requests where id='P';` | Follow **Payout risk or failed payout** (Tier 3); never edit rows | 3 |

**Known gap (do not improvise):** no **self-serve KYC** flow yet. An admin can enable
payouts via `POST /api/admin/creators/:userId/payout {enabled:true}` (sets both fields,
audited), but creators can't complete KYC themselves — payout enablement is a hand-approval
step. Wire a self-serve KYC flow before scaling beyond hand-approved beta creators.

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
