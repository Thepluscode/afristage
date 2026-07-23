import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '../../../../lib/session';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';

// Exchange credentials for a token pair and persist them as httpOnly cookies.
// Unlike admin-web, ANY user role may hold a session here — this is the audience.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  if (!res.ok) return NextResponse.json({ message: 'Login failed' }, { status: 401 });

  const data = await res.json();
  if (!data.accessToken) return NextResponse.json({ message: 'Missing access token' }, { status: 500 });

  const secure = req.nextUrl.protocol === 'https:' || process.env.WEB_COOKIE_SECURE === 'true';
  setSessionCookies(cookies(), data.accessToken, data.refreshToken, secure);
  return NextResponse.json({ ok: true });
}
