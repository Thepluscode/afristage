import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '../../../../lib/session';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';
const PRIVILEGED = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN', 'PAYOUT_REVIEWER'];

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Every upstream failure used to collapse into 401 "Login failed", so an API
  // outage, a rate limit and a wrong password were indistinguishable — an
  // operator locked out DURING an incident would hunt a credential problem that
  // did not exist. A genuine 401 stays deliberately vague (never reveal whether
  // an account exists); everything else says what actually happened.
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch {
    // fetch only throws when the API is unreachable — DNS, refused, timed out.
    return NextResponse.json(
      { message: 'Cannot reach the sign-in service. Check the API is running, then try again.' },
      { status: 503 }
    );
  }

  if (res.status === 401) return NextResponse.json({ message: 'Login failed' }, { status: 401 });
  if (res.status === 429) {
    return NextResponse.json({ message: 'Too many sign-in attempts. Wait a moment and try again.' }, { status: 429 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { message: `The sign-in service returned an error (${res.status}). This is not your password.` },
      { status: 503 }
    );
  }

  const data = await res.json();
  if (!data.accessToken) return NextResponse.json({ message: 'Missing access token' }, { status: 500 });
  // Only staff roles may hold an admin session.
  if (!PRIVILEGED.includes(data.role)) {
    return NextResponse.json({ message: 'Not an admin account' }, { status: 403 });
  }

  const secure = req.nextUrl.protocol === 'https:' || process.env.ADMIN_COOKIE_SECURE === 'true';
  setSessionCookies(cookies(), data.accessToken, data.refreshToken, secure);

  return NextResponse.json({ ok: true, role: data.role });
}
