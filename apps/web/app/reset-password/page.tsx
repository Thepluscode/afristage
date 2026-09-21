'use client';

import { useState } from 'react';

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  // The link carries the token; the field is the fallback for a mail client
  // that mangled the URL, which is exactly why the code is in the email too.
  const [token, setToken] = useState(searchParams.token || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Those passwords don't match.");
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token.trim(), newPassword: password })
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError((await res.json().catch(() => ({}))).message || 'Could not reset the password.');
  }

  if (done) {
    return (
      <main className="auth">
        <h1>Password changed</h1>
        <p className="alt">You've been signed out everywhere else. Sign in with your new password.</p>
        <p className="alt"><a href="/login">Go to sign in</a></p>
      </main>
    );
  }

  return (
    <main className="auth">
      <h1>Choose a new password</h1>
      <form onSubmit={submit}>
        {searchParams.token ? null : (
          <input
            aria-label="Reset code"
            placeholder="Paste the code from your email"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
        )}
        <input
          aria-label="New password"
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          aria-label="Confirm new password"
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
        {error ? <p className="err">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
      <p className="alt">Link expired? <a href="/forgot-password">Send a new one</a></p>
    </main>
  );
}
