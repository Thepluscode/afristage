import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from '../../../lib/session';

// The live socket (chat/reaction SENDING) needs the access JWT in socket.io's
// `auth.token`, but the token lives in an httpOnly cookie the browser JS can't
// read. This route reads it server-side and hands it back for the socket
// handshake only. A guest (no cookie) gets { token: null } and connects
// read-only (the gateway allows that, per the #198 change).
//
// ponytail: returns the current access cookie as-is. If it's expired the socket
// connects but the gateway degrades to guest (can't send) until the cookie
// refreshes on the next proxy call; add refresh-on-expiry here if reconnect churn
// ever shows up.
export function GET() {
  const token = cookies().get(ACCESS_COOKIE)?.value ?? null;
  return NextResponse.json({ token });
}
