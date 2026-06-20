import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';
const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'afristage_admin_token';
const PRIVILEGED = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN', 'PAYOUT_REVIEWER'];

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
  // Only staff roles may hold an admin session.
  if (!PRIVILEGED.includes(data.role)) {
    return NextResponse.json({ message: 'Not an admin account' }, { status: 403 });
  }

  cookies().set(COOKIE_NAME, data.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      req.nextUrl.protocol === 'https:' ||
      process.env.ADMIN_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 60 * 60
  });

  return NextResponse.json({ ok: true, role: data.role });
}
