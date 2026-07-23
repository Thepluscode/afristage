import { describe, it, expect, vi } from 'vitest';
import { api, ApiError } from '../lib/api';

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('api', () => {
  it('prefixes /api/proxy, merges JSON headers, and returns the parsed body', async () => {
    const doFetch = vi.fn().mockResolvedValue(res(200, { coins: 42 }));
    const out = await api<{ coins: number }>('/wallet/me', {}, doFetch as never);
    expect(out).toEqual({ coins: 42 });
    expect(doFetch).toHaveBeenCalledWith('/api/proxy/wallet/me', { headers: { 'content-type': 'application/json' } });
  });

  it('passes method/body through and lets caller headers win', async () => {
    const doFetch = vi.fn().mockResolvedValue(res(200, {}));
    await api('/payments/coin-purchase-intents', { method: 'POST', body: '{"x":1}', headers: { 'x-test': '1' } }, doFetch as never);
    expect(doFetch).toHaveBeenCalledWith('/api/proxy/payments/coin-purchase-intents', {
      method: 'POST',
      body: '{"x":1}',
      headers: { 'content-type': 'application/json', 'x-test': '1' }
    });
  });

  it('throws ApiError carrying the status + server message on a non-2xx', async () => {
    const doFetch = vi.fn().mockResolvedValue(res(401, { message: 'Unauthorized' }));
    await expect(api('/wallet/me', {}, doFetch as never)).rejects.toMatchObject({ status: 401, message: 'Unauthorized', name: 'ApiError' });
    expect(new ApiError(500).message).toBe('HTTP 500'); // default message
  });

  it('returns null for 204 No Content without parsing a body', async () => {
    const doFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } } as unknown as Response);
    expect(await api('/auth/logout', { method: 'POST' }, doFetch as never)).toBeNull();
  });
});
