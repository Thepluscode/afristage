import { describe, it, expect, vi } from 'vitest';
import { fetchGiftCatalog, sendGift, newIdempotencyKey } from '../lib/gifts';
import { ApiError } from '../lib/api';

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('fetchGiftCatalog', () => {
  it('returns the public catalog for a live response', async () => {
    const catalog = [{ id: 'g1', name: 'Rose', coinPrice: 10 }];
    const doFetch = vi.fn().mockResolvedValue(res(200, catalog));
    expect(await fetchGiftCatalog('http://b', doFetch as never)).toEqual(catalog);
    expect(doFetch).toHaveBeenCalledWith('http://b/gifts');
  });

  it('returns an empty list when the catalog is unreachable', async () => {
    const doFetch = vi.fn().mockResolvedValue(res(503, {}));
    expect(await fetchGiftCatalog('http://b', doFetch as never)).toEqual([]);
  });
});

describe('newIdempotencyKey', () => {
  it('returns a fresh uuid each call', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});

describe('sendGift', () => {
  it('POSTs the gift through the proxy with giftId/quantity/idempotencyKey', async () => {
    const doFetch = vi.fn().mockResolvedValue(res(201, { id: 'tx1' }));
    const out = await sendGift('r1', 'g1', 2, 'key-123', doFetch as never);
    expect(out).toEqual({ id: 'tx1' });
    expect(doFetch).toHaveBeenCalledWith('/api/proxy/live-rooms/r1/gifts', {
      method: 'POST',
      body: JSON.stringify({ giftId: 'g1', quantity: 2, idempotencyKey: 'key-123' }),
      headers: { 'content-type': 'application/json' }
    });
  });

  it('surfaces a business rejection (insufficient coins) as ApiError', async () => {
    const doFetch = vi.fn().mockResolvedValue(res(400, { message: 'Insufficient balance' }));
    await expect(sendGift('r1', 'g1', 1, 'k', doFetch as never)).rejects.toBeInstanceOf(ApiError);
  });
});
