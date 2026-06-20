# AfriStage Live

AfriStage Live is an Africa-first live creator platform MVP.

Core v1 loop:

1. Creator goes live.
2. Viewer joins the room.
3. Viewer chats and reacts.
4. Viewer buys coins.
5. Viewer sends gifts.
6. Creator earns.
7. Creator requests payout.
8. Admin moderates rooms, users, reports, and payouts.

This repository is a production-shaped scaffold, not a proprietary BIGO clone. It does **not** include copied BIGO code, private APIs, assets, protocols, or protected behaviour.

## Apps

```text
apps/api        NestJS modular backend
apps/admin-web  Next.js admin dashboard shell
apps/mobile     Flutter mobile app shell
```

## Infrastructure

```text
PostgreSQL      transactional database
Redis           realtime state/rate limits
LiveKit         live media layer, dev mode included
Docker Compose  local development
```

## Backend modules

- Auth
- Users/profiles
- Creators
- Live rooms
- Chat gateway
- Gifts
- Wallet/ledger
- Payments mock adapter
- Payouts
- Moderation/reports
- Admin audit logging
- Notifications placeholder
- Analytics placeholder

## What is implemented vs mocked

Implemented in code:

- Modular NestJS API structure
- Prisma schema for all core entities
- Auth/register/login/refresh style foundation
- Creator application
- Live room create/start/end/join-token flow
- WebSocket chat gateway scaffold
- Gift catalogue and send-gift flow
- Double-entry ledger service
- Mock coin purchase completion
- Payout request/approval/rejection/paid flows
- Reports and moderation actions
- Admin dashboard API surface
- Next.js admin pages
- Flutter mobile screen shell
- Docker Compose
- CI workflow
- Documentation

Adapters/mocks that must be replaced for production:

- Payment provider: mock provider is included; add Paystack/Flutterwave credentials and webhook signature verification before real money.
- KYC: status field exists; real KYC provider integration is not included.
- LiveKit: dev token flow exists; configure production keys and media deployment before beta.
- Push notifications: domain placeholder exists; connect FCM/APNs later.

## Quick start

### 1. Copy env

```bash
cp apps/api/.env.example apps/api/.env
```

### 2. Start local infrastructure

```bash
docker compose up -d postgres redis livekit
```

### 3. Install dependencies

```bash
npm install
```

### 4. Generate Prisma client and migrate

```bash
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
npm run seed -w apps/api
```

### 5. Run API

```bash
npm run start:dev -w apps/api
```

API health:

```bash
curl http://localhost:3000/api/health
```

### 6. Run admin dashboard

```bash
npm run dev -w apps/admin-web
```

Admin dashboard: http://localhost:3001

### 7. Run mobile app

```bash
cd apps/mobile
flutter pub get
flutter run
```

## Default seed data

Seed script creates:

- Admin user: `admin@afristage.local` / `Admin123!`
- Viewer user: `viewer@afristage.local` / `Viewer123!`
- Creator user: `creator@afristage.local` / `Creator123!`
- Default gift catalogue
- Default wallet accounts

## Critical financial invariant

Every posted ledger transaction must satisfy:

```text
total debits == total credits
```

Never edit posted ledger entries. Reverse with a new transaction.

## Closed beta launch gate

Before handing off a beta build:

```bash
npm run launch:beta
```

Before inviting or expanding real beta users against a live local/beta stack:

```bash
npm run launch:beta:live
```

Before production deploy approval:

```bash
npm run launch:production
```

Operational playbook: [`docs/phase-3-6-beta-launch-operations.md`](docs/phase-3-6-beta-launch-operations.md).

## Important warning

Do not launch with real money until you have:

- Payment provider signature verification
- Legal review
- KYC/AML rules
- Chargeback handling
- Admin MFA
- Payout approval separation of duties
- Moderation policy and trained moderators
- Load testing
- Data protection review
