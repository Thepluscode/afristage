'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';

interface CoinPackage {
  id: string;
  label: string;
  coinAmount: number;
  amountMinor: number;
  currency: string;
}

export default function BuyPage() {
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<CoinPackage[]>('/payments/coin-packages')
      .then(setPackages)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) window.location.assign('/login?next=/buy');
        else setError('Could not load coin packages.');
      });
  }, []);

  async function buy(pkg: CoinPackage) {
    setBusy(pkg.id);
    setError('');
    try {
      // provider:'card' → the API opens a provider-HOSTED checkout and returns its
      // URL. We never touch card data — just redirect to it (SAQ-A stays intact).
      const intent = await api<{ checkoutUrl?: string }>('/payments/coin-purchase-intents', {
        method: 'POST',
        body: JSON.stringify({ packageId: pkg.id, provider: 'card' })
      });
      if (intent.checkoutUrl) window.location.assign(intent.checkoutUrl);
      else { setError('Checkout is unavailable right now.'); setBusy(null); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.assign('/login?next=/buy');
      else { setError('Could not start checkout.'); setBusy(null); }
    }
  }

  return (
    <main className="auth">
      <h1>Buy coins</h1>
      {error ? <p className="err">{error}</p> : null}
      <ul className="packages">
        {packages.map((pkg) => (
          <li key={pkg.id}>
            <button type="button" disabled={busy !== null} onClick={() => buy(pkg)}>
              <strong>{pkg.coinAmount} coins</strong>
              <span>{pkg.label}</span>
              {busy === pkg.id ? <em>Opening checkout…</em> : null}
            </button>
          </li>
        ))}
      </ul>
      <p className="alt"><a href="/wallet">Back to wallet</a></p>
    </main>
  );
}
