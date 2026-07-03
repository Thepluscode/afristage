import { nextTierFor, SUPPORTER_TIERS, tierFor } from './supporter-tiers';

describe('supporter tiers', () => {
  it('is an ascending ladder', () => {
    for (let i = 1; i < SUPPORTER_TIERS.length; i++) {
      expect(SUPPORTER_TIERS[i].minCoins).toBeGreaterThan(SUPPORTER_TIERS[i - 1].minCoins);
    }
  });

  it('tierFor returns the highest met threshold, null below the ladder', () => {
    expect(tierFor(0)).toBeNull();
    expect(tierFor(99)).toBeNull();
    expect(tierFor(100)?.key).toBe('BRONZE');
    expect(tierFor(499)?.key).toBe('BRONZE');
    expect(tierFor(500)?.key).toBe('SILVER');
    expect(tierFor(2000)?.key).toBe('GOLD');
    expect(tierFor(10_000)?.key).toBe('STAGE');
    expect(tierFor(1_000_000)?.key).toBe('STAGE');
  });

  it('nextTierFor returns the next rung, null at the top', () => {
    expect(nextTierFor(0)?.key).toBe('BRONZE');
    expect(nextTierFor(100)?.key).toBe('SILVER');
    expect(nextTierFor(9_999)?.key).toBe('STAGE');
    expect(nextTierFor(10_000)).toBeNull();
  });
});
