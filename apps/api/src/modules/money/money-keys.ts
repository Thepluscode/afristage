// RFC #144: every ledger idempotency key in the system is minted here, and only
// here. The factories reproduce the legacy strings byte-identically (that IS the
// migration contract), and the branded type means a raw string cannot be passed
// where a key is required — two moves can never collide on a namespace.

export type LedgerKey = string & { readonly __ledgerKey: unique symbol };

const key = (s: string): LedgerKey => s as LedgerKey;

export const MoneyKey = {
  gift: (viewerId: string, clientKey: string) => key(`gift:${viewerId}:${clientKey}`),
  missionReward: (userId: string, missionKey: string, day: string) => key(`mission:${userId}:${missionKey}:${day}`),
  promoFund: (adminUserId: string, nonce: number) => key(`promo-fund:${adminUserId}:${nonce}`),
  prizeSettle: (eventId: string) => key(`event-prize:${eventId}`),
  payoutHold: (requestKey: string) => key(`payout_request:${requestKey}`),
  payoutReject: (payoutId: string) => key(`payout_reject:${payoutId}`),
  payoutPaid: (payoutId: string) => key(`payout_paid:${payoutId}`),
  coinPurchase: (intentId: string) => key(`coin_purchase:${intentId}`)
} as const;
