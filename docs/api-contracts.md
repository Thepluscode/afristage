# API Contracts

## Auth

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me

## Live rooms

- POST /api/live-rooms
- POST /api/live-rooms/:id/start
- POST /api/live-rooms/:id/end
- GET /api/live-rooms
- POST /api/live-rooms/:id/join-token

## Gifts

- GET /api/gifts
- POST /api/live-rooms/:id/gifts

## Wallet

- GET /api/wallet/me
- GET /api/wallet/me/ledger

## Payments

- POST /api/payments/coin-purchase-intents
- POST /api/payments/mock/:intentId/complete

## Payouts

- POST /api/payouts/request
- GET /api/payouts/me
- GET /api/admin/payouts
- POST /api/admin/payouts/:id/approve
- POST /api/admin/payouts/:id/reject
- POST /api/admin/payouts/:id/mark-paid

## Moderation

- POST /api/reports
- GET /api/admin/reports
- POST /api/admin/reports/:id/action
- POST /api/admin/users/:id/suspend
- POST /api/admin/users/:id/ban
- POST /api/admin/live-rooms/:id/suspend
