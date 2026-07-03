// Supporter Circle tiers (R4 §6, threshold-first model): loyalty status earned
// purely by CUMULATIVE gifting to a creator — a read over the ledger, never a
// charge. No join fee, no subscription, no new money path; existing gifting
// becomes belonging. ponytail: thresholds are tuning knobs — revisit against
// real gifting distribution before promoting tiers in-product.

export interface SupporterTier {
  key: string;
  label: string;
  minCoins: number;
}

// Ascending; a supporter holds the highest tier whose threshold they meet.
export const SUPPORTER_TIERS: readonly SupporterTier[] = [
  { key: 'BRONZE', label: 'Bronze supporter', minCoins: 100 },
  { key: 'SILVER', label: 'Silver supporter', minCoins: 500 },
  { key: 'GOLD', label: 'Gold supporter', minCoins: 2000 },
  { key: 'STAGE', label: 'Stage patron', minCoins: 10_000 }
];

export function tierFor(totalCoins: number): SupporterTier | null {
  let current: SupporterTier | null = null;
  for (const tier of SUPPORTER_TIERS) {
    if (totalCoins >= tier.minCoins) current = tier;
  }
  return current;
}

// The next tier above the given total, or null at the top.
export function nextTierFor(totalCoins: number): SupporterTier | null {
  return SUPPORTER_TIERS.find((tier) => totalCoins < tier.minCoins) ?? null;
}
