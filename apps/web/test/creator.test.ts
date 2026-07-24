import { describe, it, expect, vi } from 'vitest';
import { diamonds, fiat, watchHours, fetchEarnings } from '../lib/creator';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe('diamonds', () => {
  it('groups thousands with no currency symbol', () => {
    expect(diamonds(620)).toBe('620');
    expect(diamonds('1234567')).toBe('1,234,567');
    expect(diamonds(0)).toBe('0');
  });
});

describe('fiat', () => {
  it('renders the published cash value (rate = fiat minor per diamond)', () => {
    // 620 💎 × 100 minor = 62000 minor = 620.00 in the currency
    expect(fiat(620, 100, 'NGN')).toMatch(/620/);
    expect(fiat('0', 100, 'USD')).toMatch(/0/);
  });
});

describe('watchHours', () => {
  it('formats seconds to one-decimal hours', () => {
    expect(watchHours(3600)).toBe('1.0h');
    expect(watchHours('5400')).toBe('1.5h');
  });
});

describe('fetchEarnings', () => {
  it('combines dashboard + wallet + payouts into one view', async () => {
    const doFetch = vi.fn(async (url: string) => {
      if (url.endsWith('/creators/me/dashboard')) {
        return ok({
          earnings: '620',
          totalGiftTransactions: 3,
          totalRooms: 2,
          followers: 10,
          totalWatchSeconds: 3600,
          topSupporters: [{ userId: 's1', displayName: 'Big Fan', avatarUrl: null, coins: 50 }],
          payoutRate: 100,
          payoutCurrency: 'NGN'
        });
      }
      if (url.endsWith('/wallet/me')) return ok({ earningBalance: '620', payoutHoldBalance: '50' });
      if (url.endsWith('/payouts/me')) {
        return ok([{ id: 'p1', coinAmount: '500', status: 'PENDING', createdAt: '2026-07-24' }]);
      }
      throw new Error(`unexpected ${url}`);
    });
    const v = await fetchEarnings(doFetch as never);
    expect(v.availableDiamonds).toBe(620);
    expect(v.pendingDiamonds).toBe(50);
    expect(v.dashboard.payoutCurrency).toBe('NGN');
    expect(v.dashboard.topSupporters[0].coins).toBe(50);
    expect(v.payouts[0].status).toBe('PENDING');
    expect(doFetch).toHaveBeenCalledTimes(3);
  });
});
