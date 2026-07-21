import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '../middleware';

const ACCESS = 'afristage_admin_token';
const REFRESH = 'afristage_admin_refresh';

// Build a JWT-shaped token (header.payload.sig) with the given exp (seconds).
function token(exp?: number): string {
  const payload = exp === undefined ? {} : { exp };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `h.${b64}.s`;
}

function req(path: string, cookies: { access?: string; refresh?: string } = {}): NextRequest {
  const r = new NextRequest(new URL(`http://localhost${path}`));
  if (cookies.access) r.cookies.set(ACCESS, cookies.access);
  if (cookies.refresh) r.cookies.set(REFRESH, cookies.refresh);
  return r;
}

const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

describe('admin middleware', () => {
  it('lets a user with a valid access token through', () => {
    const res = middleware(req('/users', { access: token(future) }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets a user through on a valid refresh token alone (access absent)', () => {
    const res = middleware(req('/users', { refresh: token(future) }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets an expired access token through when the refresh token is still valid', () => {
    const res = middleware(req('/users', { access: token(past), refresh: token(future) }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects when there are no cookies', () => {
    const res = middleware(req('/users'));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('preserves the origin path (with query) as ?next= so re-auth returns there', () => {
    const loc = middleware(req('/payouts?status=HELD')).headers.get('location')!;
    expect(loc).toContain('/login');
    expect(new URL(loc).searchParams.get('next')).toBe('/payouts?status=HELD');
  });

  it('omits ?next= when the origin is the dashboard root', () => {
    const loc = middleware(req('/')).headers.get('location')!;
    expect(loc).toContain('/login');
    expect(new URL(loc).searchParams.has('next')).toBe(false);
  });

  it('lets public marketing pages through without cookies', () => {
    const res = middleware(req('/site'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets the public security page and disclosure path through without cookies', () => {
    expect(middleware(req('/site/security')).headers.get('location')).toBeNull();
    expect(middleware(req('/.well-known/security.txt')).headers.get('location')).toBeNull();
  });

  it('still GATES the admin security screen (/security is not public)', () => {
    const res = middleware(req('/security'));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects and clears both cookies when access and refresh are both expired', () => {
    const res = middleware(req('/users', { access: token(past), refresh: token(past) }));
    expect(res.headers.get('location')).toContain('/login');
    expect(res.cookies.get(ACCESS)?.value).toBe('');
    expect(res.cookies.get(REFRESH)?.value).toBe('');
  });

  it('redirects and clears an expired access token with no refresh cookie', () => {
    const res = middleware(req('/users', { access: token(past) }));
    expect(res.headers.get('location')).toContain('/login');
    expect(res.cookies.get(ACCESS)?.value).toBe('');
  });

  it('treats a malformed token (no payload) as expired', () => {
    const res = middleware(req('/users', { access: 'not-a-jwt' }));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('treats an unparseable payload as expired', () => {
    const res = middleware(req('/users', { access: 'h.%%%.s' }));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('accepts a token without exp (no forced logout)', () => {
    const res = middleware(req('/users', { access: token() }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects an authed user away from /login to /', () => {
    const res = middleware(req('/login', { access: token(future) }));
    expect(res.headers.get('location')).toMatch(/\/$/);
  });

  it('lets an unauthed user reach /login', () => {
    const res = middleware(req('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('clears stale cookies sitting on /login', () => {
    const res = middleware(req('/login', { access: token(past), refresh: token(past) }));
    expect(res.headers.get('location')).toBeNull(); // not authed -> stays on /login
    expect(res.cookies.get(ACCESS)?.value).toBe('');
    expect(res.cookies.get(REFRESH)?.value).toBe('');
  });
});
