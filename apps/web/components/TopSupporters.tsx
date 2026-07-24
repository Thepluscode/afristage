'use client';

import type { TopGifter } from '../lib/live';

// The room's top gifters — a small ranked strip under the header (like mobile's
// AfriTopGifterStrip). Social proof that gifting matters here.
export default function TopSupporters({ gifters }: { gifters: TopGifter[] }) {
  if (gifters.length === 0) return null;
  return (
    <div className="supporters" aria-label="Top supporters">
      {gifters.slice(0, 3).map((g) => (
        <div className="supporter" key={g.rank}>
          <span className="supporter-rank">{g.rank}</span>
          <span className="supporter-name">{g.displayName}</span>
          <span className="supporter-coins">🪙 {g.totalCoins.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
