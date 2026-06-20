# AfriStage Closed Beta Readiness Checklist

Status against the Phase 2.8 gates. ✅ = implemented + validated here; ⚠️ = remaining.

Phase 3.5 UX validation protocol: [`docs/phase-3-5-ux-validation.md`](phase-3-5-ux-validation.md).

Phase 3.6 beta launch operations protocol: [`docs/phase-3-6-beta-launch-operations.md`](phase-3-6-beta-launch-operations.md).

Phase 3.7 production launch hardening protocol: [`docs/phase-3-7-production-launch-hardening.md`](phase-3-7-production-launch-hardening.md).

## Product gate
- [x] Invite-only access (beta invites: create/list/revoke/accept, hashed codes) — `validate:beta`
- [x] Creator approval required before live room creation — `validate:beta` (unapproved → 403)
- [ ] Seeded demo users removed from production (seed is dev-only; gate at deploy)
- [ ] Terms/privacy links visible (frontend)
- [x] Report room/user available from live room (`POST /api/reports`)

## Money gate
- [x] Mock payments disabled outside development (`ENABLE_MOCK_PAYMENTS`)
- [x] Payment ownership enforced (`completeMock` rejects other users — `validate:beta`)
- [x] Provider webhooks verified (Paystack HMAC — `validate:hardening`)
- [x] Payment amount/currency/reference checked (webhook handler)
- [x] Duplicate webhooks cannot double-credit (idempotent ledger — `validate:hardening`)
- [x] Payouts remain manual review only (UNDER_REVIEW → admin approve/reject/mark-paid)
- [x] Ledger integrity check returns zero rows (`GET /api/admin/ledger/integrity`; SQL = 0)

## Safety gate
- [x] Report categories are enumerated (`ReportReason` enum)
- [x] Critical reports auto-prioritised (UNDERAGE/SELF_HARM/VIOLENCE → CRITICAL)
- [x] Admin can suspend room immediately
- [x] Admin can ban/suspend users
- [x] Moderator actions create audit logs
- [x] Support tickets exist (payment/payout/moderation/account/technical) with internal notes

## Admin gate
- [x] PAYOUT_REVIEWER cannot access broad admin routes (scoped to payout routes only)
- [x] Admin audit logs available (`GET /api/admin/audit-logs`)
- [x] Admin MFA foundation exists (TOTP + recovery codes — `validate:security`)
- [x] Beta ops dashboard available (`GET /api/admin/beta-ops`)

## Infrastructure gate
- [x] Docker local mode works (compose: postgres/redis/livekit)
- [x] Docker API mode works (image boots + HEALTHCHECK healthy)
- [x] Health endpoint works (`/api/health`, readiness `/api/health/ready`)
- [x] DB migration succeeds (`prisma migrate`)
- [x] Seed script is idempotent (unique constraints + upsert)
- [x] API build passes (`nest build`)
- [x] API tests pass (38 unit + 7 suites)
- [x] E2E money-loop script passes (`npm run demo` 27/27)

## Ledger integrity SQL

```sql
SELECT lt.id, lt.type, lt.status,
  SUM(CASE WHEN le.direction='DEBIT'  THEN le.amount_minor ELSE 0 END) AS debit_total,
  SUM(CASE WHEN le.direction='CREDIT' THEN le.amount_minor ELSE 0 END) AS credit_total
FROM ledger_transactions lt JOIN ledger_entries le ON le.transaction_id = lt.id
GROUP BY lt.id, lt.type, lt.status
HAVING SUM(CASE WHEN le.direction='DEBIT' THEN le.amount_minor ELSE 0 END)
    <> SUM(CASE WHEN le.direction='CREDIT' THEN le.amount_minor ELSE 0 END);
```
Expected: **0 rows** (verified).

## Remaining before real users
- Remove/disable seed accounts in production; set `REQUIRE_ADMIN_MFA=true`.
- Real Paystack checkout initialization + Flutterwave; real LiveKit media.
- Frontend: terms/privacy links remain a production launch gate.
- Run `npm run launch:beta:live` before inviting or expanding closed-beta users.
- Run `npm run launch:production` before production deploy approval.
