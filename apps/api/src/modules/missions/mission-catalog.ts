// Daily mission catalog (R4 §4). Progress is a pure READ over existing event
// tables — missions never introduce a new money path; the reward is a ledger
// move from the funded PROMO account to the user's COIN account.
// ponytail: a fixed catalog, reset daily (UTC). Move to a DB table when
// missions need scheduling/experiments.

export type MissionAction = 'ROOM_JOIN' | 'CHAT' | 'FOLLOW' | 'GIFT';

export interface MissionDef {
  key: string;
  label: string;
  action: MissionAction;
  target: number;
  rewardCoins: number;
}

export const MISSION_CATALOG: readonly MissionDef[] = [
  { key: 'WATCH_3', label: 'Join 3 live rooms', action: 'ROOM_JOIN', target: 3, rewardCoins: 10 },
  { key: 'CHAT_5', label: 'Send 5 chat messages', action: 'CHAT', target: 5, rewardCoins: 5 },
  { key: 'FOLLOW_1', label: 'Follow a creator', action: 'FOLLOW', target: 1, rewardCoins: 5 },
  { key: 'GIFT_1', label: 'Send a gift', action: 'GIFT', target: 1, rewardCoins: 10 }
];

export function findMission(key: string): MissionDef | undefined {
  return MISSION_CATALOG.find((m) => m.key === key);
}

// UTC day bucket for progress windows and the double-claim guard.
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcDayStart(now = new Date()): Date {
  return new Date(`${utcDay(now)}T00:00:00.000Z`);
}
