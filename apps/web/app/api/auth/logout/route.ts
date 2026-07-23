import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE, clearSessionCookies } from '../../../../lib/session';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';

// Best-effort revoke the refresh token server-side, then clear the cookies
// regardless (a failed revoke must not leave the browser stuck "logged in").
export async function POST(req: NextRequest) {
  const refreshToken = cookies().get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store'
    }).catch(() => undefined);
  }
  const secure = req.nextUrl.protocol === 'https:' || process.env.WEB_COOKIE_SECURE === 'true';
  clearSessionCookies(cookies(), secure);
  return NextResponse.json({ ok: true });
}
