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
