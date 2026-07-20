# API data-exposure contract

Every endpoint is a door. This is the rule for what may walk through it, and the
guard that enforces it (`apps/api/src/common/api-exposure.guard.spec.ts`).

## The rule

1. **Credentials never leave the server.** `passwordHash`, `mfaSecret`,
   `mfaRecoveryCodes`, `passwordResetTokenHash` are stripped from *every* user
   read by a global Prisma `omit` (`GLOBAL_USER_OMIT` in `prisma.service.ts`) — so
   they cannot leak through any relation include, even an accidental one. Auth
   opts back in (`omit: false`) only on the specific queries that verify a
   password or second factor.
2. **Cross-user / public responses carry public profile fields only.** A user's
   `email` and `phone` live on the `User` model and are returned **only** on
   `/users/me` (your own record). Any endpoint that returns *another* user
   (feed host, room participants, supporters, search, blocked list, followers)
   exposes only `Profile` fields — `displayName`, `username`, `avatarUrl`, `bio`,
   `country`, `city` — plus `creatorProfile.stageName`. Never `email`/`phone`.
3. **Whitelist, don't dump.** Cross-user reads use an explicit `select` (or the
   shared `PUBLIC_HOST_INCLUDE`), never `include: { user: true }` (which would
   return the whole row). The public display-name helper is
   `AggregationService.profilesFor`, which selects only display fields.
4. **IDs are UUIDs** (`@default(uuid())` on all 37 models) — there are no
   sequential ids to increment, so responses can carry ids safely without
   enabling enumeration.

## The guard

`api-exposure.guard.spec.ts` fails CI-equivalently if the contract regresses:
- `GLOBAL_USER_OMIT` must still strip all four credentials.
- `PUBLIC_HOST_INCLUDE` must be a `select` whitelist with no `email`/`phone`/creds.
- `profilesFor`'s select must carry no `email`/`phone`.
- A representative cross-user endpoint (supporter circle) output must be PII-free.

When you add a new cross-user endpoint, return a whitelisted shape and add it to
the guard.

## Versioning — deliberately deferred

The API is unversioned (`/api/...`, no `/v1`). Versioning protects **external**
integrators who build against your response shape; AfriStage's only clients are
its own mobile app and admin console, which deploy in lockstep with the API, so a
field rename is a same-PR concern, not a broken contract.

**Trigger to add it:** the first partner / enterprise / third-party API consumer.
At that point, freeze the current shape as `v1` (NestJS URI versioning,
`enableVersioning({ type: URI })`), and add `/v2` for changes so integrators
migrate on their own timeline. Building version routing before that consumer
exists is infrastructure ahead of the premise.
