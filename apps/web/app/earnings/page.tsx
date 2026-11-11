'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  fetchEarnings,
  fetchTargetBonus,
  targetProgress,
  diamonds,
  fiat,
  watchHours,
  type EarningsView,
  type TargetBonusView
} from '../../lib/creator';
import TopSupporters from '../../components/TopSupporters';

// Read-only creator earnings view (diamonds-branded, mirrors mobile #206). All
// data logic lives in lib/creator.ts; this shell just maps state → UI. Cashing
// out stays on the KYC-gated mobile flow for now.
export default function EarningsPage() {
  const [view, setView] = useState<EarningsView | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notCreator' | 'error'>('loading');
  const [bonus, setBonus] = useState<TargetBonusView | null>(null);

  useEffect(() => {
    fetchEarnings()
      .then((v) => {
        setView(v);
        setState('ok');
        // Optional card: if it fails, the earnings view still stands.
        fetchTargetBonus()
          .then(setBonus)
          .catch(() => setBonus(null));
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

      {bonus && (bonus.tiers.length > 0 || bonus.history.length > 0) ? <TargetCard bonus={bonus} /> : null}

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

// Monthly target bonus: progress this month toward the next tier, and bonuses
// already paid. Paid in 💎 on top of normal gift earnings after the month closes.
function TargetCard({ bonus }: { bonus: TargetBonusView }) {
  const { headline, percent } = targetProgress(bonus);
  // monthEndsAt is the exclusive UTC cutoff, so the last day that counts is the day before it.
  const lastDay = new Date(new Date(bonus.monthEndsAt).getTime() - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return (
    <div className="target">
      <h2>Monthly target</h2>
      {bonus.tiers.length > 0 ? (
        <>
          <p>{headline}</p>
          <div className="target-bar" role="progressbar" aria-label="Monthly target progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="alt">
            {diamonds(bonus.giftCoins)} gift coins received this month · gifts count until the end of {lastDay} (UTC)
          </p>
        </>
      ) : null}
      {bonus.history.length > 0 ? (
        <div className="payouts">
          {bonus.history.map((h) => (
            <div className="payout" key={h.paidAt}>
              <span>{h.month ?? 'Bonus'}</span>
              <span>+{diamonds(h.bonusCoins)} 💎</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
