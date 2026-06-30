import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '../middleware';

const COOKIE = 'afristage_admin_token';

// Build a JWT-shaped token (header.payload.sig) with the given exp (seconds).
function token(exp?: number): string {
  const payload = exp === undefined ? {} : { exp };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `h.${b64}.s`;
}

function req(path: string, cookie?: string): NextRequest {
  const r = new NextRequest(new URL(`http://localhost${path}`));
  if (cookie) r.cookies.set(COOKIE, cookie);
  return r;
}

const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

describe('admin middleware', () => {
  it('lets an authed user through to a page', () => {
    const res = middleware(req('/users', token(future)));
    expect(res.headers.get('location')).toBeNull(); // NextResponse.next()
  });

  it('redirects an unauthenticated user to /login', () => {
    const res = middleware(req('/users'));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects an expired cookie to /login and clears it', () => {
    const res = middleware(req('/users', token(past)));
    expect(res.headers.get('location')).toContain('/login');
    expect(res.cookies.get(COOKIE)?.value).toBe(''); // deleted
  });

  it('treats a malformed token (no payload) as expired', () => {
    const res = middleware(req('/users', 'not-a-jwt'));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('treats an unparseable payload as expired', () => {
    const res = middleware(req('/users', 'h.%%%.s'));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('a token without exp is accepted (no forced logout)', () => {
    const res = middleware(req('/users', token()));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects an authed user away from /login to /', () => {
    const res = middleware(req('/login', token(future)));
    expect(res.headers.get('location')).toMatch(/\/$/);
  });

  it('lets an unauthed user reach /login', () => {
    const res = middleware(req('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('clears a stale cookie sitting on /login', () => {
    const res = middleware(req('/login', token(past)));
    expect(res.headers.get('location')).toBeNull(); // not authed -> stays on /login
    expect(res.cookies.get(COOKIE)?.value).toBe('');
  });
});
