'use client';

import { FormEvent, useState } from 'react';
import { safeNext } from '../../lib/safe-next';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL || 'https://www.afristage.live/terms';
  const privacyUrl = process.env.NEXT_PUBLIC_PRIVACY_URL || 'https://www.afristage.live/privacy';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message || 'Login failed');
      return;
    }
    // Return to where they were before the session ended (validated), not the dashboard.
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = safeNext(next);
    } catch {
      setError('Unable to connect. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h1>AfriStage Admin</h1>
        <p>Sign in to manage moderation, payouts, reports, and platform operations.</p>
        <label>
          Email or phone
          <input required autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </label>
        <label>
          Password
          <input required autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="legal-links">
          By continuing you agree to <a href={termsUrl}>Terms</a> and <a href={privacyUrl}>Privacy</a>.
        </p>
      </form>
    </main>
  );
}
