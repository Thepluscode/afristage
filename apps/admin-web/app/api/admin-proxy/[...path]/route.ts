import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';
const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'afristage_admin_token';

// All admin data flows through here: the backend JWT lives in an httpOnly cookie
// and is attached server-side, so the browser never sees it.
async function proxy(req: NextRequest, path: string[]) {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const url = `${API_BASE}/${path.join('/')}${req.nextUrl.search || ''}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await req.text() : undefined;

  const res = await fetch(url, {
    method: req.method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': req.headers.get('content-type') || 'application/json'
    },
    body,
    cache: 'no-store'
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json' }
  });
}

type Ctx = { params: { path: string[] } };
export const GET = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
export const POST = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
export const PATCH = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
export const DELETE = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
