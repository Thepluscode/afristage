'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';

interface WalletSummary {
  coinBalance: string;
  earningBalance: string;
  payoutHoldBalance: string;
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<WalletSummary>('/wallet/me')
      .then(setWallet)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          window.location.assign('/login?next=/wallet');
        } else {
          setError('Could not load your wallet.');
        }
      });
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/');
  }

  return (
    <main className="auth">
      <h1>Your wallet</h1>
      {error ? <p className="err">{error}</p> : null}
      {wallet ? (
        <>
          <p className="balance">{wallet.coinBalance} <span>coins</span></p>
          <a className="cta" href="/buy">Buy coins</a>
          <p className="alt"><a href="/watch">Back to the stage</a> · <button className="link" onClick={logout} type="button">Sign out</button></p>
        </>
      ) : (
        !error && <p>Loading…</p>
      )}
    </main>
  );
}
