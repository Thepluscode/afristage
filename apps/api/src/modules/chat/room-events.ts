// Architecture candidate #6: the typed contract between domain modules and the
// socket layer. Event names were string literals at each call site and the
// whole ChatGateway (connection bookkeeping included) was injected wherever a
// module needed to emit one event or read one counter. Domain code now sees
// two narrow ports; the payload of every cross-module event is typed here, so
// a renamed event or changed payload is a compile error, not a silent client
// break.

/** Every event a NON-chat module may broadcast into a room. */
export interface RoomEvents {
  'gift.sent': {
    giftTransactionId: string;
    roomId: string;
    giftId: string;
    giftName: string;
    animationUrl: string | null;
    senderId: string;
    quantity: number;
    totalCoinAmount: number;
    creatorEarningMinor: number;
    platformFeeMinor: number;
    createdAt: Date;
  };
  'room.ended': { roomId: string; reason: 'HOST_ENDED' | 'ADMIN_ENDED' };
  'user.muted': { roomId: string; userId: string; durationSeconds: number };
  'chat.deleted': { roomId: string; messageId: string };
}

// Abstract classes double as Nest injection tokens; ChatGateway implements
// both and the chat module binds them with useExisting.

/** Event sink: fire-and-forget typed broadcasts into a room. */
export abstract class RoomBroadcast {
  abstract emit<K extends keyof RoomEvents>(roomId: string, event: K, payload: RoomEvents[K]): void;
}

/** Sync read: live viewers in a room on THIS instance (documented ceiling —
 *  presence is per-instance; see the chat gateway's Redis adapter notes). */
export abstract class RoomPresence {
  abstract viewerCount(roomId: string): number;
}
