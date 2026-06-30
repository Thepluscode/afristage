import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/headers cookies() — the routes set/delete/read the admin cookie.
const store = new Map<string, string>();
const cookieJar = {
  set: vi.fn((name: string, value: string) => store.set(name, value)),
  delete: vi.fn((name: string) => store.delete(name)),
  get: vi.fn((name: string) => (store.has(name) ? { value: store.get(name) } : undefined))
};
vi.mock('next/headers', () => ({ cookies: () => cookieJar }));

import { POST as login } from '../app/api/auth/login/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { DELETE, GET, PATCH as proxyPatch, POST as proxyPost } from '../app/api/admin-proxy/[...path]/route';

function loginReq(body: unknown, proto = 'http'): NextRequest {
  return new NextRequest(new URL(`${proto}://localhost/api/auth/login`), {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

describe('auth/login route', () => {
  beforeEach(() => store.clear());
  afterEach(() => vi.restoreAllMocks());

  it('rejects bad backend credentials with 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const res = await login(loginReq({ identifier: 'x', password: 'y' }));
    expect(res.status).toBe(401);
  });

  it('500s when the backend omits an access token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ role: 'ADMIN' }) }));
    const res = await login(loginReq({ identifier: 'x', password: 'y' }));
    expect(res.status).toBe(500);
  });

  it('403s a non-privileged role', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 't', role: 'USER' }) }));
    const res = await login(loginReq({ identifier: 'x', password: 'y' }));
    expect(res.status).toBe(403);
  });

  it('sets the cookie and returns the role for a privileged login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 't', role: 'ADMIN' }) }));
    const res = await login(loginReq({ identifier: 'x', password: 'y' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: 'ADMIN' });
    expect(cookieJar.set).toHaveBeenCalledWith('afristage_admin_token', 't', expect.objectContaining({ httpOnly: true }));
  });

  it('marks the cookie secure over https', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 't', role: 'SUPER_ADMIN' }) }));
    await login(loginReq({ identifier: 'x', password: 'y' }, 'https'));
    expect(cookieJar.set).toHaveBeenCalledWith('afristage_admin_token', 't', expect.objectContaining({ secure: true }));
  });
});

describe('auth/logout route', () => {
  it('deletes the cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(cookieJar.delete).toHaveBeenCalledWith('afristage_admin_token');
  });
});

describe('admin-proxy route', () => {
  beforeEach(() => store.clear());
  afterEach(() => vi.restoreAllMocks());

  function proxyReq(method: string, search = '', body?: string): NextRequest {
    return new NextRequest(new URL(`http://localhost/api/admin-proxy/admin/x${search}`), {
      method,
      body
    });
  }

  it('401s without a cookie', async () => {
    const res = await GET(proxyReq('GET'), { params: { path: ['admin', 'x'] } });
    expect(res.status).toBe(401);
  });

  it('forwards a GET with the bearer token and returns the upstream body', async () => {
    store.set('afristage_admin_token', 'tok');
    const f = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => '{"ok":true}',
      headers: new Headers({ 'content-type': 'application/json' })
    });
    vi.stubGlobal('fetch', f);
    const res = await GET(proxyReq('GET', '?a=1'), { params: { path: ['admin', 'x'] } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(f).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/x?a=1',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ authorization: 'Bearer tok' }) })
    );
  });

  it('forwards a POST body and falls back to default content-type', async () => {
    store.set('afristage_admin_token', 'tok');
    const f = vi.fn().mockResolvedValue({ status: 201, text: async () => '', headers: new Headers() });
    vi.stubGlobal('fetch', f);
    const res = await proxyPost(proxyReq('POST', '', '{"v":1}'), { params: { path: ['admin', 'x'] } });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    const call = f.mock.calls[0][1];
    expect(call.body).toBe('{"v":1}');
  });

  it('forwards a PATCH body', async () => {
    store.set('afristage_admin_token', 'tok');
    const f = vi.fn().mockResolvedValue({ status: 200, text: async () => '{}', headers: new Headers() });
    vi.stubGlobal('fetch', f);
    const res = await proxyPatch(proxyReq('PATCH', '', '{"v":2}'), { params: { path: ['admin', 'x'] } });
    expect(res.status).toBe(200);
    expect(f.mock.calls[0][1].body).toBe('{"v":2}');
  });

  it('supports DELETE (no body)', async () => {
    store.set('afristage_admin_token', 'tok');
    const f = vi.fn().mockResolvedValue({ status: 200, text: async () => '{}', headers: new Headers() });
    vi.stubGlobal('fetch', f);
    const res = await DELETE(proxyReq('DELETE'), { params: { path: ['admin', 'x'] } });
    expect(res.status).toBe(200);
    expect(f.mock.calls[0][1].body).toBe(''); // DELETE reads an (empty) body
  });
});
