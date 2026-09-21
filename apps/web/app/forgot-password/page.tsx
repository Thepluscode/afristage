'use client';

import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    setBusy(false);
    // Success is phrased conditionally ("if there's an account") because the
    // API does not reveal whether the address exists, and neither should this.
    if (res.ok) setSent(true);
    else setError((await res.json().catch(() => ({}))).message || 'Something went wrong. Try again.');
  }

  if (sent) {
    return (
      <main className="auth">
        <h1>Check your email</h1>
        <p className="alt">
          If there's an AfriStage account for <strong>{email}</strong>, a reset link is on its way. It expires in 15 minutes.
        </p>
        <p className="alt">Not there? Check spam, then <a href="/forgot-password">try again</a>.</p>
      </main>
    );
  }

  return (
    <main className="auth">
      <h1>Forgot password</h1>
      <p className="alt">We'll email you a link to choose a new one.</p>
      <form onSubmit={submit}>
        <input
          aria-label="Email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        {error ? <p className="err">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <p className="alt">Remembered it? <a href="/login">Sign in</a></p>
    </main>
  );
}
