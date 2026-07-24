import { apiBase } from './live';

// The socket.io server lives at the API's ROOT origin under the /chat namespace,
// while apiBase ends in /api — strip it to get the origin the client connects to.
export function socketOrigin(base?: string): string {
  return apiBase(base).replace(/\/api\/?$/, '');
}

// Server → client event payloads (typed by the API's RoomEvents contract).
export interface ChatMessage {
  id: string;
  message: string;
  senderId: string;
  senderName?: string | null;
  createdAt?: string;
}

export interface GiftSent {
  giftTransactionId: string;
  giftId: string;
  giftName: string;
  animationUrl: string | null;
  senderId: string;
  quantity: number;
  totalCoinAmount: number;
}

export interface ViewerCountUpdate {
  roomId: string;
  count: number;
}
