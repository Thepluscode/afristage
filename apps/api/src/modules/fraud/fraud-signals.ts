// Explainable, rule-based fraud signals for creator/payout review. NOT ML — a
// fixed, auditable set of weighted rules (per the product blueprint's "start
// simple" fraud section). evaluate() returns every signal with whether it fired
// and its weight, plus an overall risk score and a recommended action, so a
// reviewer sees exactly WHY a creator was flagged.
//
// ponytail: weights + thresholds below are the tuning knobs. Adjust against
// labelled outcomes (FP/FN) before trusting them to auto-hold money.

export type FraudAction = 'NONE' | 'SOFT_FLAG' | 'MANUAL_REVIEW' | 'PAYOUT_HOLD';

export const FRAUD_WEIGHTS = {
  newCreator: 0.25, // young account
  giftConcentration: 0.35, // most income from one supporter (wash-gifting smell)
  reciprocalGifting: 0.3, // creator gifts back to its own supporters (loop)
  giftSpike: 0.3 // abnormal recent spike vs baseline (often precedes a payout)
} as const;

export const FRAUD_THRESHOLDS = {
  newCreatorDays: 14,
  concentrationRatio: 0.8, // top supporter >= 80% of income
  concentrationFloorCoins: 100_000, // ...only meaningful above a floor
  spikeMultiple: 5, // last-24h >= 5x the daily baseline
  // risk score -> action
  hold: 0.6,
  review: 0.35,
  softFlag: 0.15
} as const;

export interface FraudFeatures {
  accountAgeDays: number;
  totalGiftIncomeCoins: number;
  topSupporterCoins: number; // most given by any single supporter
  topSupporterIsReciprocated: boolean; // creator has also gifted a top supporter
  last24hIncomeCoins: number;
  dailyBaselineCoins: number; // avg daily income over the prior baseline window
}

export interface FraudSignal {
  key: keyof typeof FRAUD_WEIGHTS;
  triggered: boolean;
  weight: number;
  detail: string;
}

export interface FraudAssessment {
  riskScore: number; // 0..1
  recommendedAction: FraudAction;
  signals: FraudSignal[];
}

function actionFor(score: number): FraudAction {
  if (score >= FRAUD_THRESHOLDS.hold) return 'PAYOUT_HOLD';
  if (score >= FRAUD_THRESHOLDS.review) return 'MANUAL_REVIEW';
  if (score >= FRAUD_THRESHOLDS.softFlag) return 'SOFT_FLAG';
  return 'NONE';
}

export function evaluateFraudSignals(f: FraudFeatures): FraudAssessment {
  const concentration = f.totalGiftIncomeCoins > 0 ? f.topSupporterCoins / f.totalGiftIncomeCoins : 0;
  const spikeRatio = f.dailyBaselineCoins > 0 ? f.last24hIncomeCoins / f.dailyBaselineCoins : 0;

  const signals: FraudSignal[] = [
    {
      key: 'newCreator',
      triggered: f.accountAgeDays < FRAUD_THRESHOLDS.newCreatorDays,
      weight: FRAUD_WEIGHTS.newCreator,
      detail: `account is ${f.accountAgeDays.toFixed(1)}d old (threshold ${FRAUD_THRESHOLDS.newCreatorDays}d)`
    },
    {
      key: 'giftConcentration',
      triggered:
        f.totalGiftIncomeCoins >= FRAUD_THRESHOLDS.concentrationFloorCoins &&
        concentration >= FRAUD_THRESHOLDS.concentrationRatio,
      weight: FRAUD_WEIGHTS.giftConcentration,
      detail: `top supporter = ${(concentration * 100).toFixed(0)}% of ${f.totalGiftIncomeCoins} coins`
    },
    {
      key: 'reciprocalGifting',
      triggered: f.topSupporterIsReciprocated,
      weight: FRAUD_WEIGHTS.reciprocalGifting,
      detail: f.topSupporterIsReciprocated ? 'creator has gifted back to a top supporter' : 'no reciprocal gifting'
    },
    {
      key: 'giftSpike',
      triggered: f.dailyBaselineCoins > 0 && spikeRatio >= FRAUD_THRESHOLDS.spikeMultiple,
      weight: FRAUD_WEIGHTS.giftSpike,
      detail: `last 24h = ${spikeRatio.toFixed(1)}x daily baseline`
    }
  ];

  const riskScore = Math.min(
    1,
    signals.reduce((sum, s) => sum + (s.triggered ? s.weight : 0), 0)
  );
  return { riskScore, recommendedAction: actionFor(riskScore), signals };
}

// ---------------------------------------------------------------------------
// Group-aggregate signals (R4 §7 gate). A "group" is any set of user ids —
// a future Creator Circle, a mission cohort, or an ad-hoc reviewer selection.
// Collective flows multiply the fraud surface (coordinated self-gifting, circle
// wash-trading to farm points/prizes), and the per-creator scorer cannot see
// them: each member can look clean while the RING is the anomaly.
//
// ponytail: weights + thresholds are tuning knobs — adjust against labelled
// outcomes (FP/FN) before trusting them to gate rewards automatically.

export const GROUP_FRAUD_WEIGHTS = {
  internalGifting: 0.4, // wash-trading: volume where sender AND receiver are both members
  youngMembers: 0.25, // farm smell: most members are freshly created accounts
  groupSpike: 0.35 // coordinated burst of internal gifting vs baseline
} as const;

export const GROUP_FRAUD_THRESHOLDS = {
  internalShare: 0.5, // >=50% of the group's gift volume stays inside the group
  internalFloorCoins: 10_000, // ...only meaningful above a volume floor
  youngMemberShare: 0.5, // >=50% of members younger than youngDays
  youngDays: 7,
  spikeMultiple: 5 // last-24h internal volume >= 5x its daily baseline
} as const;

export interface GroupFraudFeatures {
  memberCount: number;
  youngMemberCount: number; // members younger than youngDays
  totalGiftCoins: number; // all gift volume involving any member (either side)
  internalGiftCoins: number; // volume where both sender and receiver are members
  last24hInternalCoins: number;
  dailyBaselineInternalCoins: number; // avg daily internal volume over the prior window
}

export interface GroupFraudSignal {
  key: keyof typeof GROUP_FRAUD_WEIGHTS;
  triggered: boolean;
  weight: number;
  detail: string;
}

export interface GroupFraudAssessment {
  riskScore: number; // 0..1
  recommendedAction: FraudAction;
  signals: GroupFraudSignal[];
}

export function evaluateGroupFraudSignals(f: GroupFraudFeatures): GroupFraudAssessment {
  const internalShare = f.totalGiftCoins > 0 ? f.internalGiftCoins / f.totalGiftCoins : 0;
  const youngShare = f.memberCount > 0 ? f.youngMemberCount / f.memberCount : 0;
  const spikeRatio = f.dailyBaselineInternalCoins > 0 ? f.last24hInternalCoins / f.dailyBaselineInternalCoins : 0;

  const signals: GroupFraudSignal[] = [
    {
      key: 'internalGifting',
      triggered:
        f.internalGiftCoins >= GROUP_FRAUD_THRESHOLDS.internalFloorCoins &&
        internalShare >= GROUP_FRAUD_THRESHOLDS.internalShare,
      weight: GROUP_FRAUD_WEIGHTS.internalGifting,
      detail: `${(internalShare * 100).toFixed(0)}% of ${f.totalGiftCoins} coins circulates inside the group (${f.internalGiftCoins} internal)`
    },
    {
      key: 'youngMembers',
      triggered: f.memberCount > 0 && youngShare >= GROUP_FRAUD_THRESHOLDS.youngMemberShare,
      weight: GROUP_FRAUD_WEIGHTS.youngMembers,
      detail: `${f.youngMemberCount}/${f.memberCount} members are younger than ${GROUP_FRAUD_THRESHOLDS.youngDays}d`
    },
    {
      key: 'groupSpike',
      triggered: f.dailyBaselineInternalCoins > 0 && spikeRatio >= GROUP_FRAUD_THRESHOLDS.spikeMultiple,
      weight: GROUP_FRAUD_WEIGHTS.groupSpike,
      detail: `last 24h internal volume = ${spikeRatio.toFixed(1)}x daily baseline`
    }
  ];

  const riskScore = Math.min(
    1,
    signals.reduce((sum, s) => sum + (s.triggered ? s.weight : 0), 0)
  );
  return { riskScore, recommendedAction: actionFor(riskScore), signals };
}
