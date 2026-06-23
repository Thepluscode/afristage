// Server-authoritative coin catalog. The client may only pick a package id — it
// never sets the price or the coin amount, so it cannot mint coins for less money.
// ponytail: a constant catalog is enough for beta; move to a DB table only when
// packages need admin CRUD or per-market pricing.
export type CoinPackage = {
  id: string;
  label: string;
  amountMinor: number; // fiat minor units (e.g. NGN kobo)
  currency: string;
  coinAmount: number;
};

export const COIN_PACKAGES: readonly CoinPackage[] = [
  { id: 'starter', label: '₦1,000 → 100 coins', amountMinor: 100_000, currency: 'NGN', coinAmount: 100 },
  { id: 'popular', label: '₦5,000 → 550 coins', amountMinor: 500_000, currency: 'NGN', coinAmount: 550 },
  { id: 'pro', label: '₦10,000 → 1,200 coins', amountMinor: 1_000_000, currency: 'NGN', coinAmount: 1_200 }
];

export function findCoinPackage(id: string): CoinPackage | undefined {
  return COIN_PACKAGES.find((p) => p.id === id);
}
