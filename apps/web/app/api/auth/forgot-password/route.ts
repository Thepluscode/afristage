import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';

// Ask for a reset mail. The API is deliberately non-enumerating — an unknown
// address gets the same {ok:true} as a known one — so this route must not add
// a distinction of its own by, say, reporting "no such user".
//
// A 503 DOES pass through: it means the provider rejected the send, and the
// person is better told to try again than left waiting for mail that failed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_BASE}/auth/password-reset/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: body.email }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000)
  }).catch(() => null);

  if (!res) return NextResponse.json({ message: 'Could not reach the server. Try again.' }, { status: 502 });
  if (res.status === 503) return NextResponse.json({ message: 'Reset email is unavailable right now. Try again shortly.' }, { status: 503 });
  if (!res.ok) return NextResponse.json({ message: 'Could not start the reset.' }, { status: res.status });
  return NextResponse.json({ ok: true });
}
