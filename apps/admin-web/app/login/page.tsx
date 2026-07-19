'use client';

import { FormEvent, useState } from 'react';

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
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message || 'Login failed');
      return;
    }
    window.location.href = '/';
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h1>AfriStage Admin</h1>
        <p>Sign in to manage moderation, payouts, reports, and platform operations.</p>
        <label>
          Email or phone
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <p className="error">{error}</p> : null}
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
