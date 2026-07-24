'use client';

import type { GiftSent } from '../lib/socket';

// The BIGO signature: a gift someone just sent flies up over the stage. Each
// gift.sent from the socket is keyed by its transaction id so React animates it
// once; the parent trims the list so only the last few float at a time.
export default function GiftOverlay({ gifts }: { gifts: GiftSent[] }) {
  if (gifts.length === 0) return null;
  return (
    <div className="gifts-fly" aria-hidden="true">
      {gifts.map((g) => (
        <div className="gift-fly" key={g.giftTransactionId}>
          {g.animationUrl ? <img src={g.animationUrl} alt="" /> : <span className="gift-emoji">🎁</span>}
          <span className="gift-fly-label">
            {g.giftName}
            {g.quantity > 1 ? ` ×${g.quantity}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
