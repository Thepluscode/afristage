// Notification trigger taxonomy (R4 §1). Every notification the platform emits
// must use a registered type — notifyUser rejects unknown types so ad-hoc
// strings can't silently fragment the taxonomy again.
//
// Reserved for future features (register only when the feature ships, no dead
// types): CIRCLE_EVENT, MISSION_READY, EVENT_STARTING.
export type NotificationType = 'CREATOR_LIVE' | 'NEW_FOLLOWER' | 'GIFT_RECOGNITION' | 'PAYOUT_UPDATE';

export type NotificationTypeMeta = {
  label: string;
  description: string;
  // false = transactional (money/status) — the user cannot opt out.
  optOut: boolean;
  // Minimum minutes between notifications of this type for the same user
  // (scoped to the room when one is attached). 0 = no throttle.
  throttleMinutes: number;
};

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeMeta> = {
  CREATOR_LIVE: {
    label: 'Creator live',
    description: 'A creator you follow goes live',
    optOut: true,
    throttleMinutes: 30 // same room restarting within the window doesn't re-ping followers
  },
  NEW_FOLLOWER: {
    label: 'New follower',
    description: 'Someone starts following you',
    optOut: true,
    // No throttle: each follower is a distinct event and the dedup key has no
    // actor column — follow-spam control belongs at the follow endpoint.
    throttleMinutes: 0
  },
  GIFT_RECOGNITION: {
    label: 'Top supporter',
    description: 'You become the top supporter in a room',
    optOut: true,
    throttleMinutes: 30 // at most one "top supporter" ping per room per window
  },
  PAYOUT_UPDATE: {
    label: 'Payout updates',
    description: 'Your payout status changes',
    optOut: false, // money-status is transactional; never silently dropped
    throttleMinutes: 0
  }
};

export function isNotificationType(type: string): type is NotificationType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, type);
}
