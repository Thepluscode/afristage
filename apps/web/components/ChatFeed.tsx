'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../lib/socket';

// Bottom-left scrolling comment feed — the "the room is alive" signal. Read-only
// for guests (the API rejects their sends); a signed-in send input is a fast
// follow (needs the socket auth token wired).
export default function ChatFeed({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) return null;
  return (
    <div className="chat" aria-live="polite">
      {messages.map((m) => (
        <div className="chat-line" key={m.id}>
          <span className="chat-who">{m.senderName || 'Someone'}</span>
          <span className="chat-msg">{m.message}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
