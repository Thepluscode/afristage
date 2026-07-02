import { evaluateFraudSignals, FraudFeatures, FRAUD_WEIGHTS } from './fraud-signals';

const clean: FraudFeatures = {
  accountAgeDays: 120,
  totalGiftIncomeCoins: 1_000_000,
  topSupporterCoins: 100_000, // 10% concentration
  topSupporterIsReciprocated: false,
  last24hIncomeCoins: 10_000,
  dailyBaselineCoins: 10_000 // 1x baseline
};

const triggered = (a: any) => a.signals.filter((s: any) => s.triggered).map((s: any) => s.key);

describe('evaluateFraudSignals', () => {
  it('a clean, established creator trips nothing -> NONE', () => {
    const a = evaluateFraudSignals(clean);
    expect(a.riskScore).toBe(0);
    expect(a.recommendedAction).toBe('NONE');
  });

  it('flags a young account', () => {
    const a = evaluateFraudSignals({ ...clean, accountAgeDays: 2 });
    expect(triggered(a)).toContain('newCreator');
  });

  it('flags gift concentration only above the income floor', () => {
    const concentrated = { ...clean, totalGiftIncomeCoins: 1_000_000, topSupporterCoins: 950_000 };
    expect(triggered(evaluateFraudSignals(concentrated))).toContain('giftConcentration');
    // same 95% ratio but tiny income -> not meaningful, must NOT trip
    const tiny = { ...clean, totalGiftIncomeCoins: 1000, topSupporterCoins: 950 };
    expect(triggered(evaluateFraudSignals(tiny))).not.toContain('giftConcentration');
  });

  it('flags reciprocal (loop) gifting', () => {
    const a = evaluateFraudSignals({ ...clean, topSupporterIsReciprocated: true });
    expect(triggered(a)).toContain('reciprocalGifting');
  });

  it('flags an abnormal income spike vs baseline', () => {
    const a = evaluateFraudSignals({ ...clean, last24hIncomeCoins: 100_000, dailyBaselineCoins: 10_000 }); // 10x
    expect(triggered(a)).toContain('giftSpike');
  });

  it('escalates the action as more signals stack', () => {
    // young + concentrated -> 0.25 + 0.35 = 0.60 -> PAYOUT_HOLD
    const a = evaluateFraudSignals({ ...clean, accountAgeDays: 1, topSupporterCoins: 950_000 });
    expect(a.riskScore).toBeCloseTo(FRAUD_WEIGHTS.newCreator + FRAUD_WEIGHTS.giftConcentration, 5);
    expect(a.recommendedAction).toBe('PAYOUT_HOLD');
  });

  it('a single mid-weight signal lands in MANUAL_REVIEW, a light one in SOFT_FLAG', () => {
    expect(evaluateFraudSignals({ ...clean, topSupporterCoins: 950_000 }).recommendedAction).toBe('MANUAL_REVIEW'); // 0.35
    expect(evaluateFraudSignals({ ...clean, accountAgeDays: 1 }).recommendedAction).toBe('SOFT_FLAG'); // 0.25
  });

  it('caps the risk score at 1 when everything fires', () => {
    const a = evaluateFraudSignals({
      accountAgeDays: 0,
      totalGiftIncomeCoins: 1_000_000,
      topSupporterCoins: 1_000_000,
      topSupporterIsReciprocated: true,
      last24hIncomeCoins: 1_000_000,
      dailyBaselineCoins: 1000
    });
    expect(a.riskScore).toBe(1);
    expect(a.recommendedAction).toBe('PAYOUT_HOLD');
  });
});

// --- group-aggregate signals ---
import { evaluateGroupFraudSignals, GroupFraudFeatures, GROUP_FRAUD_WEIGHTS } from './fraud-signals';

const cleanGroup: GroupFraudFeatures = {
  memberCount: 10,
  youngMemberCount: 1, // 10% young
  totalGiftCoins: 100_000,
  internalGiftCoins: 5_000, // 5% internal
  last24hInternalCoins: 100,
  dailyBaselineInternalCoins: 100 // 1x baseline
};

describe('evaluateGroupFraudSignals', () => {
  it('a clean group trips nothing -> NONE', () => {
    const a = evaluateGroupFraudSignals(cleanGroup);
    expect(a.riskScore).toBe(0);
    expect(a.recommendedAction).toBe('NONE');
  });

  it('flags heavy internal (wash) gifting only above the volume floor', () => {
    const washy = { ...cleanGroup, totalGiftCoins: 100_000, internalGiftCoins: 80_000 }; // 80% internal
    expect(triggered(evaluateGroupFraudSignals(washy))).toContain('internalGifting');
    // same share but tiny volume -> below floor, must NOT trip
    const tiny = { ...cleanGroup, totalGiftCoins: 1_000, internalGiftCoins: 800 };
    expect(triggered(evaluateGroupFraudSignals(tiny))).not.toContain('internalGifting');
  });

  it('flags a group dominated by freshly created accounts (and not an empty group)', () => {
    const farm = { ...cleanGroup, memberCount: 10, youngMemberCount: 8 };
    expect(triggered(evaluateGroupFraudSignals(farm))).toContain('youngMembers');
    const empty = { ...cleanGroup, memberCount: 0, youngMemberCount: 0 };
    expect(triggered(evaluateGroupFraudSignals(empty))).not.toContain('youngMembers');
  });

  it('flags a coordinated internal-gifting spike, but not without a baseline', () => {
    const burst = { ...cleanGroup, last24hInternalCoins: 5_000, dailyBaselineInternalCoins: 100 }; // 50x
    expect(triggered(evaluateGroupFraudSignals(burst))).toContain('groupSpike');
    const noBaseline = { ...cleanGroup, last24hInternalCoins: 5_000, dailyBaselineInternalCoins: 0 };
    expect(triggered(evaluateGroupFraudSignals(noBaseline))).not.toContain('groupSpike');
  });

  it('all signals firing caps at 1 and recommends PAYOUT_HOLD', () => {
    const ring: GroupFraudFeatures = {
      memberCount: 5,
      youngMemberCount: 5,
      totalGiftCoins: 100_000,
      internalGiftCoins: 90_000,
      last24hInternalCoins: 50_000,
      dailyBaselineInternalCoins: 100
    };
    const a = evaluateGroupFraudSignals(ring);
    expect(a.riskScore).toBe(1);
    expect(a.recommendedAction).toBe('PAYOUT_HOLD');
    expect(a.signals.every((s) => s.weight === GROUP_FRAUD_WEIGHTS[s.key])).toBe(true);
  });

  it('a single mid-weight signal lands on MANUAL_REVIEW', () => {
    const a = evaluateGroupFraudSignals({ ...cleanGroup, last24hInternalCoins: 5_000, dailyBaselineInternalCoins: 100 });
    expect(a.riskScore).toBeCloseTo(0.35);
    expect(a.recommendedAction).toBe('MANUAL_REVIEW');
  });

  it('zero-volume group yields zero shares (no NaN)', () => {
    const a = evaluateGroupFraudSignals({ ...cleanGroup, totalGiftCoins: 0, internalGiftCoins: 0 });
    expect(a.riskScore).toBe(0);
  });
});
