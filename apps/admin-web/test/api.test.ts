import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminGet, adminLogout, adminPatch, adminPost } from '../lib/api';

function mockFetch(res: Partial<Response> & { jsonBody?: unknown; textBody?: string }) {
  return vi.fn().mockResolvedValue({
    ok: res.ok ?? true,
    status: res.status ?? 200,
    json: async () => res.jsonBody ?? {},
    text: async () => res.textBody ?? ''
  } as Response);
}

describe('lib/api', () => {
  beforeEach(() => {
    window.location.href = 'http://localhost/';
  });
  afterEach(() => vi.restoreAllMocks());

  it('adminGet hits the proxy and returns json', async () => {
    const f = mockFetch({ jsonBody: { a: 1 } });
    vi.stubGlobal('fetch', f);
    const out = await adminGet<{ a: number }>('/admin/dashboard');
    expect(out).toEqual({ a: 1 });
    expect(f).toHaveBeenCalledWith('/api/admin-proxy/admin/dashboard', expect.objectContaining({ method: 'GET', cache: 'no-store' }));
  });

  it('adminPost / adminPatch send a json body', async () => {
    const f = mockFetch({ jsonBody: { ok: true } });
    vi.stubGlobal('fetch', f);
    await adminPost('/admin/x', { v: 1 });
    await adminPatch('/admin/y', { v: 2 });
    expect(f).toHaveBeenNthCalledWith(1, '/api/admin-proxy/admin/x', expect.objectContaining({
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: 1 })
    }));
    expect(f).toHaveBeenNthCalledWith(2, '/api/admin-proxy/admin/y', expect.objectContaining({ method: 'PATCH' }));
  });

  it('redirects to /login and throws on 401', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 401 }));
    await expect(adminGet('/admin/x')).rejects.toThrow('Unauthorized');
    expect(window.location.href).toBe('/login');
  });

  it('throws with status + body on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 500, textBody: 'boom' }));
    await expect(adminGet('/admin/x')).rejects.toThrow('GET /admin/x failed: 500 boom');
  });

  it('adminLogout posts then redirects to /login', async () => {
    const f = mockFetch({ jsonBody: { ok: true } });
    vi.stubGlobal('fetch', f);
    await adminLogout();
    expect(f).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(window.location.href).toBe('/login');
  });
});
