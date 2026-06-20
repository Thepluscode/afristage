import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'afristage_admin_token';

export async function POST() {
  cookies().delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
