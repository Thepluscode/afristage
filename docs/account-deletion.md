# Account deletion & GDPR erasure

Delete is a business process, not a button. This is the cascade map + policy the
code in `apps/api/src/modules/account` implements. Written before the first
deletion request so we know what happens to every record a user touches.

## Lifecycle

```
ACTIVE ──user clicks "delete" OR admin deletes──▶ DELETED (soft)
                                                    │  PII retained, sessions killed,
                                                    │  cannot log in. 30-day window.
                                                    │
              admin "purge now" (GDPR 72h SLA) ─────┤──▶ hard erasure
                    auto-sweep after 30 days ───────┘     (PII scrubbed, personal
                                                           rows deleted, financial
                                                           records retained & anonymised)
```

- **Soft delete** = deactivate immediately, **retain all data 30 days** for a
  compliance review or accidental-deletion reversal. The user is gone from the
  app (login/refresh gate on `status === 'ACTIVE'`; every session revoked;
  `tokenVersion` bumped so all issued tokens die). Reversible by an admin
  flipping `status` back to `ACTIVE` within the window — nothing is scrubbed yet.
- **Hard delete** = irreversible erasure. Runs automatically 30 days after soft
  delete, or immediately when an admin fulfils a GDPR erasure request (72h SLA).

## Retention window

`RETENTION_DAYS = 30` (`account.service.ts`). `purgeExpired()` hard-deletes every
`DELETED` user whose `deletedAt` is older than the cutoff. It is called from the
daily beta-ops checklist / a Railway cron — **not** a bespoke scheduler service.
<!-- ponytail: sweep from ops/cron; real scheduler when volume needs it. -->

## The cascade map — what happens to each record on **hard delete**

The load-bearing tension: financial records **must be retained** (accounting/tax
retention, typically 5–7 years; GDPR Art. 17(3)(b) permits retention under a legal
obligation). We retain them **anonymised** — the `User` row survives as a bare
UUID tombstone with every PII column nulled, because non-nullable financial FKs
point at it. Everything by which a natural person could be identified is gone.

| Model | User field(s) | Hard-delete verdict | Why |
|---|---|---|---|
| **User** | `id` | **Retain as tombstone**, scrub PII (email, phone, passwordHash, mfa*, resetToken → null) | Non-nullable financial FKs require the row; PII removed = erased |
| Profile | `userId` | **Anonymise** (displayName→"Deleted user", username→`deleted_<id>`, avatar/bio/country/city→null) | Keep row so feed/room/gift history renders instead of null-derefing |
| CreatorProfile | `userId`, `reviewedById` | **Anonymise** stageName; null `reviewedById` on others | Creator content history; KYC bank data lives in PayoutMethod (deleted) |
| Follow | `followerId`, `followingId` | **Delete** | Social graph, personal, no retention duty |
| Block | `blockerId`, `blockedId` | **Delete** | Personal |
| RoomReminder | `userId` | **Delete** | Personal |
| RoomParticipant | `userId` | **Delete** | Personal viewing history |
| RoomMute | `userId` | **Delete** | Personal |
| ChatMessage | `senderId` | **Delete** | Personal expression, may contain PII |
| MissionClaim | `userId` | **Delete** | Personal |
| CircleMember | `userId` | **Delete** | Personal |
| CreatorStreamStat | `creatorUserId` | **Delete** | Personal analytics |
| Notification | `userId` | **Delete** | Personal |
| NotificationPreference | `userId` | **Delete** | Personal |
| DeviceSession | `userId` | **Delete** | Credentials/device metadata |
| FraudAssessment | `userId` | **Delete** | Personal risk data |
| AgencyCreator | `creatorUserId` | **Delete** | Membership |
| PayoutMethod | `userId` | **Delete** | **Bank details — PII, must be removed** |
| SupportTicket / …Message | `requesterId` / `senderId` | **Delete** | Personal correspondence |
| Report (made) | `reporterId` | **Delete** | Reporter's own reports |
| Report (against) | `targetUserId` | **Null** | Retain moderation record without the subject link |
| ModerationAction | `targetUserId` | **Null** | Retain moderation audit trail |
| PayoutRequest | `creatorUserId` (retain), `reviewedBy` (null) | **Retain** (creator), **null** reviewer link | Financial record — accounting retention |
| **WalletAccount** | `userId` | **Retain**, linked to the PII-free tombstone | Ledger integrity (`LedgerEntry`→`accountId`); nulling `userId` collides with the one-system-wallet-per-(type,currency) partial unique index, and the tombstone carries no PII anyway |
| LedgerTransaction / LedgerEntry | — (via account) | **Retain untouched** | Immutable double-entry financial record |
| PaymentIntent | `userId` | **Retain** (points at tombstone) | Financial/tax record |
| GiftTransaction | `viewerId` | **Retain** (points at tombstone) | Financial record, links to ledger |
| LiveRoom | `hostUserId` | **Retain** (points at tombstone) | Content/moderation history |

No `onDelete: Cascade` in the schema **on purpose** — a blind cascade would delete
the ledger with the user and destroy accounting integrity. Deletion is explicit,
ordered code in one transaction so every retain/anonymise decision is visible.

## GDPR data report (Art. 15)

`export(userId)` returns a JSON report of everything held on the user across the
tables above. Credentials (passwordHash, mfaSecret, recovery codes, reset tokens)
are **never** included — PrismaService globally omits them. Internal admin notes
(`SupportTicketMessage.internal = true`) are excluded. Available self-service
(`GET /account/export`) and to admins (`GET /admin/users/:id/export`) so we can
answer an erasure request inside the 72-hour window.

## Endpoints

| Endpoint | Auth | Action |
|---|---|---|
| `DELETE /account` (body: `{ password }`) | user (JWT) + password re-auth | soft-delete own account |
| `GET /account/export` | user (JWT) | own GDPR data report |
| `POST /admin/users/:id/delete` | ADMIN+ | soft-delete a user |
| `POST /admin/users/:id/purge` | ADMIN+ | **immediate** hard delete (GDPR erasure, 72h) |
| `GET /admin/users/:id/export` | ADMIN+ | a user's GDPR data report |
| `POST /admin/accounts/purge-expired` | ADMIN+ | run the 30-day sweep (ops/cron) |

Self-service delete requires the current password (defends a hijacked session).
All actions write an `AdminAuditLog` row (`account.soft_delete` / `account.hard_delete`).

## Known gaps (honest)

- Deleting an account with a pending payout or wallet balance does **not** block —
  soft-delete retains the payout/ledger for the 30-day window so an admin can
  still settle or refund before the hard purge. Add a pre-delete balance check if
  this bites.
- Read-path filtering of `DELETED` users on public surfaces relies on the existing
  `status` gate; a few display joins may still surface an anonymised tombstone
  ("Deleted user") rather than hiding the row entirely. Acceptable at beta.
