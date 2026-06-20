# Phase 3.7 — Production Launch Hardening

## Objective

Block unsafe production launch states before real users or real money are exposed. Phase 3.7 turns production assumptions into executable gates: admin MFA required, mock payments disabled, seeded accounts blocked, legal links visible, secure cookies enforced, and production configuration validated.

## Commands

Static production hardening check:

```bash
npm run validate:production-readiness
```

Production environment check:

```bash
npm run validate:production-readiness -- --env
```

Production launch gate:

```bash
npm run launch:production
```

`launch:production` expects production environment variables and a live stack. It should fail locally unless production-equivalent env is intentionally supplied.

## Hard Gates

| Gate | Enforcement |
|---|---|
| Production secrets are present | `apps/api/src/config/validate-env.ts` |
| Placeholder secrets rejected | `apps/api/src/config/validate-env.ts` |
| `REQUIRE_ADMIN_MFA=true` | API boot validation and production readiness validator |
| `ENABLE_MOCK_PAYMENTS` not `true` | API boot validation and production readiness validator |
| Seeded accounts blocked | `AuthService` rejects seeded identifiers in production |
| Admin cookie secure-aware | Admin login route uses HTTPS or `ADMIN_COOKIE_SECURE=true` |
| Terms/Privacy visible | Admin login, mobile login, registration, onboarding |
| Live beta smoke still passes | `launch:production` runs live beta gate |

## Production Environment Requirements

Required:

```text
NODE_ENV=production
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
DATABASE_URL
REDIS_URL
PAYSTACK_SECRET_KEY
REQUIRE_ADMIN_MFA=true
ADMIN_COOKIE_SECURE=true or ADMIN_BASE_URL=https://...
NEXT_PUBLIC_TERMS_URL or TERMS_URL
NEXT_PUBLIC_PRIVACY_URL or PRIVACY_URL
```

Must not be true:

```text
ENABLE_MOCK_PAYMENTS=true
ALLOW_SEEDED_PROD_LOGIN=true
```

## Remaining Non-Code Launch Tasks

- Replace placeholder Terms and Privacy URLs with final legal URLs.
- Confirm production admin accounts have MFA enabled before `REQUIRE_ADMIN_MFA=true` is enforced.
- Remove or disable seeded demo users from production data.
- Configure real Paystack keys and webhook endpoint.
- Configure production LiveKit keys and media endpoint.
- Assign payout reviewer, moderation owner, and support owner for launch day.

## Completion Criteria

Phase 3.7 is complete when:

- `npm run validate:production-readiness` passes.
- `npm run validate:production-readiness -- --env` passes with production-equivalent env.
- `npm run launch:beta:live` passes.
- `npm run launch:production` is the required production deploy approval command.
