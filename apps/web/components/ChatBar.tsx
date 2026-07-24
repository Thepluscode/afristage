'use client';

import { useState } from 'react';

// Bottom bar: a chat input (signed-in only — the gateway rejects guest sends, so
// we show a sign-in prompt instead) and an always-available heart tap.
export default function ChatBar({
  canSend,
  onSend,
  onHeart
}: {
  canSend: boolean;
  onSend: (message: string) => void;
  onHeart: () => void;
}) {
  const [text, setText] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  }

  return (
    <form className="chatbar" onSubmit={submit}>
      {canSend ? (
        <input
          className="chatbar-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          maxLength={200}
          aria-label="Chat message"
        />
      ) : (
        <a className="chatbar-signin" href="/login?next=/watch">
          Sign in to chat
        </a>
      )}
      <button type="button" className="heart-btn" onClick={onHeart} aria-label="Send a heart">
        ❤️
      </button>
    </form>
  );
}
