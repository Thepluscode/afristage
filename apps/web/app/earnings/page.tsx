'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { fetchEarnings, diamonds, fiat, watchHours, type EarningsView } from '../../lib/creator';
import TopSupporters from '../../components/TopSupporters';

// Read-only creator earnings view (diamonds-branded, mirrors mobile #206). All
// data logic lives in lib/creator.ts; this shell just maps state → UI. Cashing
// out stays on the KYC-gated mobile flow for now.
export default function EarningsPage() {
  const [view, setView] = useState<EarningsView | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notCreator' | 'error'>('loading');

  useEffect(() => {
    fetchEarnings()
      .then((v) => {
        setView(v);
        setState('ok');
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          window.location.assign('/login?next=/earnings');
        } else if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          setState('notCreator');
        } else {
          setState('error');
        }
      });
  }, []);

  if (state === 'loading') {
    return (
      <main className="auth">
        <p>Loading…</p>
      </main>
    );
  }

  if (state === 'notCreator') {
    return (
      <main className="auth">
        <h1>Creator earnings</h1>
        <p className="alt">
          Earnings are for approved creators. Apply to host in the AfriStage app — your 💎 will show up here.
        </p>
        <p className="alt">
          <a href="/watch">Back to the stage</a>
        </p>
      </main>
    );
  }

  if (state === 'error' || !view) {
    return (
      <main className="auth">
        <h1>Creator earnings</h1>
        <p className="err">Could not load your earnings.</p>
        <p className="alt">
          <a href="/watch">Back to the stage</a>
        </p>
      </main>
    );
  }

  const d = view.dashboard;
  const supporters = d.topSupporters.map((s, i) => ({
    rank: i + 1,
    displayName: s.displayName,
    totalCoins: s.coins
  }));

  return (
    <main className="auth earnings">
      <h1>Creator earnings</h1>
      <p className="balance">
        {diamonds(view.availableDiamonds)} <span>💎 available</span>
      </p>
      <p className="alt">
        ≈ {fiat(view.availableDiamonds, d.payoutRate, d.payoutCurrency)} · {diamonds(view.pendingDiamonds)} 💎 pending
        payout
      </p>

      <div className="stats">
        <div className="stat">
          <strong>{d.totalGiftTransactions.toLocaleString()}</strong>
          <span>Gifts</span>
        </div>
        <div className="stat">
          <strong>{d.totalRooms.toLocaleString()}</strong>
          <span>Rooms</span>
        </div>
        <div className="stat">
          <strong>{d.followers.toLocaleString()}</strong>
          <span>Followers</span>
        </div>
        <div className="stat">
          <strong>{watchHours(d.totalWatchSeconds)}</strong>
          <span>Watch time</span>
        </div>
      </div>

      <TopSupporters gifters={supporters} />

      {view.payouts.length > 0 ? (
        <div className="payouts">
          <h2>Payout history</h2>
          {view.payouts.map((p) => (
            <div className="payout" key={p.id}>
              <span>{diamonds(p.coinAmount)} 💎</span>
              <span className="payout-status">{p.status}</span>
            </div>
          ))}
        </div>
      ) : null}

      <p className="alt">
        To cash out, request a payout in the AfriStage app. · <a href="/wallet">Wallet</a> · <a href="/watch">Stage</a>
      </p>
    </main>
  );
}
