import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/headers cookies() — the routes read/set/delete the session cookies.
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

const ACCESS = 'afristage_admin_token';
const REFRESH = 'afristage_admin_refresh';
const REFRESH_URL = 'http://localhost:3000/api/auth/refresh';

function loginReq(body: unknown, proto = 'http'): NextRequest {
  return new NextRequest(new URL(`${proto}://localhost/api/auth/login`), { method: 'POST', body: JSON.stringify(body) });
}

function proxyReq(method: string, search = '', body?: string): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/admin-proxy/admin/x${search}`), { method, body });
}
const ctx = { params: { path: ['admin', 'x'] } };

// A fetch mock that routes /auth/refresh to a configurable refresh response and
// everything else to `api(url, opts)`.
function mockFetch(opts: {
  refreshOk?: boolean;
  refreshBody?: unknown;
  refreshJsonThrows?: boolean;
  api?: (url: string, o: any) => any;
}) {
  const f = vi.fn(async (url: string, o: any) => {
    if (String(url).endsWith('/auth/refresh')) {
      if (opts.refreshOk === false) return { ok: false };
      return {
        ok: true,
        json: async () => {
          if (opts.refreshJsonThrows) throw new Error('bad json');
          return opts.refreshBody ?? { accessToken: 'new-access', refreshToken: 'new-refresh' };
        }
      };
    }
    return opts.api ? opts.api(url, o) : { status: 200, text: async () => '{}', headers: new Headers() };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => store.clear());
afterEach(() => vi.restoreAllMocks());

describe('auth/login route', () => {
  it('rejects bad backend credentials with 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect((await login(loginReq({ identifier: 'x', password: 'y' }))).status).toBe(401);
  });

  it('500s when the backend omits an access token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ role: 'ADMIN' }) }));
    expect((await login(loginReq({ identifier: 'x', password: 'y' }))).status).toBe(500);
  });

  it('403s a non-privileged role', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 't', role: 'USER' }) }));
    expect((await login(loginReq({ identifier: 'x', password: 'y' }))).status).toBe(403);
  });

  it('sets both session cookies and returns the role for a privileged login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 'a', refreshToken: 'r', role: 'ADMIN' }) }));
    const res = await login(loginReq({ identifier: 'x', password: 'y' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: 'ADMIN' });
    expect(cookieJar.set).toHaveBeenCalledWith(ACCESS, 'a', expect.objectContaining({ httpOnly: true }));
    expect(cookieJar.set).toHaveBeenCalledWith(REFRESH, 'r', expect.objectContaining({ httpOnly: true }));
  });

  it('marks cookies secure over https', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 'a', refreshToken: 'r', role: 'SUPER_ADMIN' }) }));
    await login(loginReq({ identifier: 'x', password: 'y' }, 'https'));
    expect(cookieJar.set).toHaveBeenCalledWith(ACCESS, 'a', expect.objectContaining({ secure: true }));
  });
});

describe('auth/logout route', () => {
  it('deletes both session cookies', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(cookieJar.delete).toHaveBeenCalledWith(ACCESS);
    expect(cookieJar.delete).toHaveBeenCalledWith(REFRESH);
  });
});

describe('admin-proxy route', () => {
  it('401s when there is neither an access nor a refresh cookie', async () => {
    mockFetch({});
    expect((await GET(proxyReq('GET'), ctx)).status).toBe(401);
  });

  it('forwards a GET with the bearer token and returns the upstream body', async () => {
    store.set(ACCESS, 'tok');
    const f = mockFetch({ api: () => ({ status: 200, text: async () => '{"ok":true}', headers: new Headers({ 'content-type': 'application/json' }) }) });
    const res = await GET(proxyReq('GET', '?a=1'), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(f).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/x?a=1',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ authorization: 'Bearer tok' }) })
    );
  });

  it('refreshes when there is no access token but a valid refresh cookie', async () => {
    store.set(REFRESH, 'rt');
    const f = mockFetch({ api: (_url, o) => ({ status: 200, text: async () => '{}', headers: new Headers(), _auth: o.headers.authorization }) });
    const res = await GET(proxyReq('GET'), ctx);
    expect(res.status).toBe(200);
    // refresh happened, then the data call used the new access token
    expect(f).toHaveBeenCalledWith(REFRESH_URL, expect.objectContaining({ method: 'POST' }));
    expect(f).toHaveBeenCalledWith('http://localhost:3000/api/admin/x', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer new-access' }) }));
    expect(store.get(ACCESS)).toBe('new-access'); // cookies persisted
    expect(store.get(REFRESH)).toBe('new-refresh');
  });

  it('401s when there is no access token and refresh has no cookie', async () => {
    // no cookies at all -> tryRefresh returns null (no refresh cookie)
    mockFetch({});
    expect((await GET(proxyReq('GET'), ctx)).status).toBe(401);
  });

  it('retries once with a refreshed token when the upstream returns 401', async () => {
    store.set(ACCESS, 'old');
    store.set(REFRESH, 'rt');
    let n = 0;
    const f = mockFetch({
      api: () => {
        n += 1;
        return n === 1
          ? { status: 401, text: async () => 'nope', headers: new Headers() }
          : { status: 200, text: async () => '{"ok":1}', headers: new Headers() };
      }
    });
    const res = await GET(proxyReq('GET'), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":1}');
    expect(f).toHaveBeenCalledWith(REFRESH_URL, expect.objectContaining({ method: 'POST' }));
  });

  it('returns the 401 when the upstream is 401 and there is no refresh cookie', async () => {
    store.set(ACCESS, 'old');
    mockFetch({ api: () => ({ status: 401, text: async () => 'no', headers: new Headers() }) });
    expect((await GET(proxyReq('GET'), ctx)).status).toBe(401);
  });

  it('returns the 401 when refresh itself is rejected', async () => {
    store.set(ACCESS, 'old');
    store.set(REFRESH, 'rt');
    mockFetch({ refreshOk: false, api: () => ({ status: 401, text: async () => 'no', headers: new Headers() }) });
    expect((await GET(proxyReq('GET'), ctx)).status).toBe(401);
  });

  it('returns the 401 when refresh succeeds but returns no access token', async () => {
    store.set(ACCESS, 'old');
    store.set(REFRESH, 'rt');
    mockFetch({ refreshBody: { role: 'ADMIN' }, api: () => ({ status: 401, text: async () => 'no', headers: new Headers() }) });
    expect((await GET(proxyReq('GET'), ctx)).status).toBe(401);
  });

  it('returns the 401 when the refresh response body is unparseable', async () => {
    store.set(ACCESS, 'old');
    store.set(REFRESH, 'rt');
    mockFetch({ refreshJsonThrows: true, api: () => ({ status: 401, text: async () => 'no', headers: new Headers() }) });
    expect((await GET(proxyReq('GET'), ctx)).status).toBe(401);
  });

  it('returns a bodyless response for a 204 upstream (no NextResponse crash)', async () => {
    store.set(ACCESS, 'tok');
    mockFetch({ api: () => ({ status: 204, text: async () => '', headers: new Headers() }) });
    const res = await DELETE(proxyReq('DELETE'), ctx);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('forwards a POST body and falls back to default content-type', async () => {
    store.set(ACCESS, 'tok');
    const f = mockFetch({ api: () => ({ status: 201, text: async () => '', headers: new Headers() }) });
    const res = await proxyPost(proxyReq('POST', '', '{"v":1}'), ctx);
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(f.mock.calls.find((c) => c[0] === 'http://localhost:3000/api/admin/x')![1].body).toBe('{"v":1}');
  });

  it('forwards a PATCH body', async () => {
    store.set(ACCESS, 'tok');
    const f = mockFetch({ api: () => ({ status: 200, text: async () => '{}', headers: new Headers() }) });
    const res = await proxyPatch(proxyReq('PATCH', '', '{"v":2}'), ctx);
    expect(res.status).toBe(200);
    expect(f.mock.calls.find((c) => c[0] === 'http://localhost:3000/api/admin/x')![1].body).toBe('{"v":2}');
  });
});
