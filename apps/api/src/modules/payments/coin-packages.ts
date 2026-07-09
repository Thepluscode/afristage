// Server-authoritative coin catalog. The client may only pick a package id — it
// never sets the price or the coin amount, so it cannot mint coins for less money.
// Coins are the internal unit; each market prices the SAME coin amounts in its
// own currency, and the currency routes the purchase to the right provider
// (African corridors → Paystack, global cards → Stripe).
// ponytail: a constant catalog is enough for beta; move to a DB table only when
// packages need admin CRUD or per-market experiments.
export type CoinPackage = {
  id: string;
  label: string;
  amountMinor: number; // fiat minor units (NGN kobo, USD cents, …)
  currency: string;
  coinAmount: number;
};

export const COIN_PACKAGES: readonly CoinPackage[] = [
  // Nigeria (Paystack)
  { id: 'starter', label: '₦1,000 → 100 coins', amountMinor: 100_000, currency: 'NGN', coinAmount: 100 },
  { id: 'popular', label: '₦5,000 → 550 coins', amountMinor: 500_000, currency: 'NGN', coinAmount: 550 },
  { id: 'pro', label: '₦10,000 → 1,200 coins', amountMinor: 1_000_000, currency: 'NGN', coinAmount: 1_200 },
  // Global cards (Stripe) — same coin amounts, USD-priced. Adjust price points freely.
  { id: 'starter_usd', label: '$1.00 → 100 coins', amountMinor: 100, currency: 'USD', coinAmount: 100 },
  { id: 'popular_usd', label: '$5.00 → 550 coins', amountMinor: 500, currency: 'USD', coinAmount: 550 },
  { id: 'pro_usd', label: '$10.00 → 1,200 coins', amountMinor: 1_000, currency: 'USD', coinAmount: 1_200 }
];

export function findCoinPackage(id: string): CoinPackage | undefined {
  return COIN_PACKAGES.find((p) => p.id === id);
}
