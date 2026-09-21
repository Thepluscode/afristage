import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';

// Exchange the one-time token for a new password. No session is issued here on
// purpose: confirming signs the user out everywhere (the old password, and
// anyone holding it, must lose every session), so the page sends them to sign
// in afresh with what they just chose.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_BASE}/auth/password-reset/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: body.token, newPassword: body.newPassword }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000)
  }).catch(() => null);

  if (!res) return NextResponse.json({ message: 'Could not reach the server. Try again.' }, { status: 502 });
  if (res.ok) return NextResponse.json({ ok: true });

  // The API says "Invalid or expired reset token" for both cases, and so do we:
  // telling someone which one it was tells an attacker the same thing.
  const message = res.status === 400 ? 'That reset link is invalid or has expired. Request a new one.' : 'Could not reset the password.';
  return NextResponse.json({ message }, { status: res.status });
}
