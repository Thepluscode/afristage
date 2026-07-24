'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  socketOrigin,
  fetchSocketToken,
  type ChatMessage,
  type GiftSent,
  type ViewerCountUpdate,
  type ReactionSent
} from '../lib/socket';
import { apiBase, fetchTopGifters, type TopGifter } from '../lib/live';

// One live heart on screen (floating up, then removed).
interface Heart { id: number; type: string; }

// The live layer: connect to the /chat socket (with the viewer's token if signed
// in — enables SENDING; guest = read-only), join the room, and surface viewer
// count + chat feed + gift stream + reactions + top supporters. Mirrors what the
// mobile room already does.
export function useRoomLive(roomId: string | null) {
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gifts, setGifts] = useState<GiftSent[]>([]);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [topGifters, setTopGifters] = useState<TopGifter[]>([]);
  const [canSend, setCanSend] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const heartSeq = useRef(0);

  const addHeart = useCallback((type: string) => {
    const id = ++heartSeq.current;
    setHearts((prev) => [...prev.slice(-19), { id, type }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 2600);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let socket: Socket | null = null;

    (async () => {
      const base = apiBase();
      fetchTopGifters(base, roomId).then((t) => { if (!cancelled) setTopGifters(t); }).catch(() => {});
      const token = await fetchSocketToken().catch(() => null);
      if (cancelled) return;
      setCanSend(!!token);

      socket = io(`${socketOrigin()}/chat`, {
        transports: ['websocket'],
        withCredentials: false,
        auth: token ? { token } : undefined
      });
      socketRef.current = socket;

      socket.on('connect', () => socket!.emit('room.join', { roomId }));
      socket.on('room.viewer_count_updated', (p: ViewerCountUpdate) => {
        if (p.roomId === roomId) setViewerCount(p.count);
      });
      socket.on('chat.message_created', (m: ChatMessage) => setMessages((prev) => [...prev.slice(-49), m]));
      socket.on('gift.sent', (g: GiftSent) => setGifts((prev) => [...prev.slice(-9), g]));
      socket.on('reaction.sent', (r: ReactionSent) => { if (r.roomId === roomId) addHeart(r.reactionType); });
    })();

    return () => {
      cancelled = true;
      socket?.emit('room.leave', { roomId });
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [roomId, addHeart]);

  // Send a chat message (signed-in only; the gateway rejects guests).
  const sendChat = useCallback((message: string) => {
    const s = socketRef.current;
    if (!s || !roomId || !message.trim()) return;
    s.emit('chat.message', { roomId, message: message.trim() });
  }, [roomId]);

  // Send a heart (optimistic local heart + broadcast to the room).
  const sendReaction = useCallback((type = 'heart') => {
    addHeart(type);
    socketRef.current?.emit('reaction.sent', { roomId, reactionType: type });
  }, [roomId, addHeart]);

  return { viewerCount, messages, gifts, hearts, topGifters, canSend, sendChat, sendReaction };
}
