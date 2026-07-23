'use client';

import { useEffect, useState } from 'react';
import { apiBase } from '../lib/live';
import { fetchGiftCatalog, sendGift, newIdempotencyKey, type Gift } from '../lib/gifts';
import { ApiError } from '../lib/api';

export default function GiftDrawer({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [status, setStatus] = useState('');
  const [lowBalance, setLowBalance] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetchGiftCatalog(apiBase())
      .then(setGifts)
      .catch(() => setGifts([]));
  }, []);

  async function send(gift: Gift) {
    setSending(gift.id);
    setStatus('');
    setLowBalance(false);
    try {
      await sendGift(roomId, gift.id, 1, newIdempotencyKey());
      setStatus(`Sent a ${gift.name}! 🎉`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.assign('/login?next=/watch');
        return;
      }
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setLowBalance(true);
        setStatus('Not enough coins.');
      } else {
        setStatus('Could not send the gift.');
      }
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="drawer" role="dialog" aria-label="Send a gift">
      <div className="drawer-head">
        <span>Send a gift</span>
        <button className="link" onClick={onClose} type="button" aria-label="Close">✕</button>
      </div>
      {status ? (
        <p className="drawer-status">
          {status} {lowBalance ? <a href="/buy">Buy coins</a> : null}
        </p>
      ) : null}
      <ul className="gift-grid">
        {gifts.map((g) => (
          <li key={g.id}>
            <button type="button" disabled={sending !== null} onClick={() => send(g)}>
              <strong>{g.name}</strong>
              <span>{g.coinPrice} coins</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
