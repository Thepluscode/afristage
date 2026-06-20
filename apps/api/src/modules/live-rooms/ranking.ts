// Explainable live-room ranking. Deliberately NOT machine learning: a fixed,
// debuggable weighted sum (per the product blueprint). scoreRoom() returns the
// component breakdown alongside the total so every ranking decision is auditable.
//
// ponytail: fixed normalization scales below. They're the one tuning knob — adjust
// when real traffic shows the feed clustering at 0 or 1 on any component.

import { ReportPriority } from '@prisma/client';

export const RANKING_WEIGHTS = {
  liveViewer: 0.25,
  watchTime: 0.2,
  giftVelocity: 0.15,
  languageMatch: 0.15,
  countryMatch: 0.1,
  followGraph: 0.1,
  newCreator: 0.05,
  reportRisk: -0.3
} as const;

// Normalization scales: the value that maps a raw signal to 1.0 (then capped).
export const RANKING_SCALES = {
  viewers: 200, // active viewers
  watchMinutes: 15, // average session length
  giftCoinsPerMin: 500, // gifting intensity
  reportRiskPoints: 3, // summed open-report severity
  newCreatorDays: 14 // boost window for fresh creators
} as const;

// Open-report severity points — CRITICAL sinks a room hard, LOW barely registers.
export const REPORT_SEVERITY: Record<ReportPriority, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0.5
} as const;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface RoomFeatures {
  activeViewers: number;
  avgWatchMinutes: number;
  giftCoinsPerMin: number;
  languageMatch: boolean; // room.language === viewer.language
  countryMatch: boolean; // room.country === viewer.country
  followsHost: boolean; // viewer follows the host
  creatorAgeDays: number | null; // null = unknown/established
  reportRiskPoints: number; // sum of REPORT_SEVERITY over open reports
}

export interface RankingBreakdown {
  score: number;
  components: Record<keyof typeof RANKING_WEIGHTS, number>; // post-weight contributions
}

// Pure: same features -> same score. No clock, no IO.
export function scoreRoom(f: RoomFeatures): RankingBreakdown {
  const normals = {
    liveViewer: clamp01(f.activeViewers / RANKING_SCALES.viewers),
    watchTime: clamp01(f.avgWatchMinutes / RANKING_SCALES.watchMinutes),
    giftVelocity: clamp01(f.giftCoinsPerMin / RANKING_SCALES.giftCoinsPerMin),
    languageMatch: f.languageMatch ? 1 : 0,
    countryMatch: f.countryMatch ? 1 : 0,
    followGraph: f.followsHost ? 1 : 0,
    newCreator:
      f.creatorAgeDays === null ? 0 : clamp01(1 - f.creatorAgeDays / RANKING_SCALES.newCreatorDays),
    reportRisk: clamp01(f.reportRiskPoints / RANKING_SCALES.reportRiskPoints)
  };

  const components = Object.fromEntries(
    (Object.keys(RANKING_WEIGHTS) as (keyof typeof RANKING_WEIGHTS)[]).map((k) => [
      k,
      RANKING_WEIGHTS[k] * normals[k]
    ])
  ) as Record<keyof typeof RANKING_WEIGHTS, number>;

  const score = Object.values(components).reduce((a, b) => a + b, 0);
  return { score, components };
}
