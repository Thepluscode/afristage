'use client';

import { useState } from 'react';

export default function RegisterPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next || '/wallet';
  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '' });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, ageConfirmed })
    });
    setBusy(false);
    if (res.ok) window.location.assign(next);
    else {
      const body = await res.json().catch(() => null);
      setError(body?.message || 'Could not create your account.');
    }
  }

  return (
    <main className="auth">
      <h1>Join the audience</h1>
      <form onSubmit={submit}>
        <input aria-label="Email" type="email" placeholder="Email" value={form.email} onChange={set('email')} autoComplete="email" required />
        <input aria-label="Username" placeholder="Username" value={form.username} onChange={set('username')} autoComplete="username" required />
        <input aria-label="Display name" placeholder="Display name" value={form.displayName} onChange={set('displayName')} required />
        <input aria-label="Password" type="password" placeholder="Password (8+ characters)" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={8} required />
        <label className="check">
          <input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} required />
          I confirm I am 18 or older.
        </label>
        {error ? <p className="err">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="alt">Already have an account? <a href={`/login?next=${encodeURIComponent(next)}`}>Sign in</a></p>
    </main>
  );
}
