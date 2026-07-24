'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { socketOrigin, type ChatMessage, type GiftSent, type ViewerCountUpdate } from '../lib/socket';

// The live layer: connect to the /chat socket as a GUEST (read-only — the API
// allows tokenless connections and just gates SENDING), join the room, and
// surface the real-time viewer count + chat feed + gift stream. Kept out of lib/
// (it's SDK/effect integration, not unit-testable logic — socketOrigin is).
export function useRoomLive(roomId: string | null) {
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gifts, setGifts] = useState<GiftSent[]>([]);

  useEffect(() => {
    if (!roomId) return;
    const socket = io(`${socketOrigin()}/chat`, { transports: ['websocket'], withCredentials: false });

    socket.on('connect', () => socket.emit('room.join', { roomId }));
    socket.on('room.viewer_count_updated', (p: ViewerCountUpdate) => {
      if (p.roomId === roomId) setViewerCount(p.count);
    });
    socket.on('chat.message_created', (m: ChatMessage) => setMessages((prev) => [...prev.slice(-49), m]));
    socket.on('gift.sent', (g: GiftSent) => setGifts((prev) => [...prev.slice(-9), g]));

    return () => {
      socket.emit('room.leave', { roomId });
      socket.disconnect();
    };
  }, [roomId]);

  return { viewerCount, messages, gifts };
}
