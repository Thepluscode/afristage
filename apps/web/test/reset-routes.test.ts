import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as forgot } from '../app/api/auth/forgot-password/route';
import { POST as reset } from '../app/api/auth/reset-password/route';

afterEach(() => vi.unstubAllGlobals());

const req = (url: string, body: unknown) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

const upstream = (status: number, body = '{}') =>
  vi.fn().mockImplementation(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } }));

describe('forgot-password proxy', () => {
  it('forwards the address and reports ok', async () => {
    const f = upstream(201, '{"ok":true}');
    vi.stubGlobal('fetch', f);
    const res = await forgot(req('http://web.test/api/auth/forgot-password', { email: 'a@b.c' }));
    expect(res.status).toBe(200);
    expect(f.mock.calls[0][0]).toMatch(/\/auth\/password-reset\/request$/);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ email: 'a@b.c' });
  });

  it('passes a provider outage through as 503 rather than pretending it sent', async () => {
    vi.stubGlobal('fetch', upstream(503, '{"message":"unavailable"}'));
    const res = await forgot(req('http://web.test/api/auth/forgot-password', { email: 'a@b.c' }));
    expect(res.status).toBe(503);
  });

  it('answers 502 when the API is unreachable, never a false ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await forgot(req('http://web.test/api/auth/forgot-password', { email: 'a@b.c' }));
    expect(res.status).toBe(502);
  });
});

describe('reset-password proxy', () => {
  it('exchanges the token and reports ok', async () => {
    const f = upstream(201, '{"ok":true}');
    vi.stubGlobal('fetch', f);
    const res = await reset(req('http://web.test/api/auth/reset-password', { token: 'abc', newPassword: 'NewPassw0rd!' }));
    expect(res.status).toBe(200);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ token: 'abc', newPassword: 'NewPassw0rd!' });
  });

  it('does not say WHICH of invalid-or-expired it was', async () => {
    vi.stubGlobal('fetch', upstream(400, '{"message":"Invalid or expired reset token"}'));
    const res = await reset(req('http://web.test/api/auth/reset-password', { token: 'stale', newPassword: 'NewPassw0rd!' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/invalid or has expired/i);
    expect(body.message).not.toMatch(/expired only|already used|unknown token/i);
  });
});
