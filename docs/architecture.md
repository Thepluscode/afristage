# AfriStage Architecture

AfriStage v1 uses a modular monolith.

## Runtime

```text
Flutter Mobile App -> NestJS API -> PostgreSQL/Redis -> LiveKit
Next.js Admin App -> NestJS API
```

## Backend modules

- Auth
- Users
- Creators
- Live Rooms
- Chat
- Gifts
- Wallet/Ledger
- Payments
- Payouts
- Moderation

## Why modular monolith first

Microservices would add distributed transactions, network failure modes, deployment overhead, and debugging complexity before the product has traffic. The code is structured by bounded context so modules can be extracted later.
