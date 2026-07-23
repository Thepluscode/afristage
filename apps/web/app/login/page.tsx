'use client';

import { useState } from 'react';

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next || '/wallet';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    setBusy(false);
    if (res.ok) window.location.assign(next);
    else setError('Wrong email/username or password.');
  }

  return (
    <main className="auth">
      <h1>Welcome back</h1>
      <form onSubmit={submit}>
        <input aria-label="Email or username" placeholder="Email or username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
        <input aria-label="Password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {error ? <p className="err">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="alt">New here? <a href={`/register?next=${encodeURIComponent(next)}`}>Create an account</a></p>
    </main>
  );
}
