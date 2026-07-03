import { NotFoundException } from '@nestjs/common';
import { SupportersService } from './supporters.service';

function build() {
  const prisma: any = {
    creatorProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'c1' }) },
    giftTransaction: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalCoinAmount: 0 } }),
      groupBy: jest.fn().mockResolvedValue([])
    },
    profile: { findMany: jest.fn().mockResolvedValue([]) }
  };
  return { service: new SupportersService(prisma), prisma };
}

describe('SupportersService.myStanding', () => {
  it('throws NotFound for an unknown creator', async () => {
    const { service, prisma } = build();
    prisma.creatorProfile.findUnique.mockResolvedValue(null);
    await expect(service.myStanding('ghost', 'v1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports no tier below the ladder with the first rung as next (null sum -> 0)', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.aggregate.mockResolvedValue({ _sum: { totalCoinAmount: null } });
    const res = await service.myStanding('c1', 'v1');
    expect(res).toEqual({
      creatorUserId: 'c1',
      totalCoins: 0,
      tier: null,
      nextTier: { key: 'BRONZE', label: 'Bronze supporter', coinsToGo: 100 }
    });
    expect(prisma.giftTransaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { creatorId: 'c1', viewerId: 'v1' } })
    );
  });

  it('reports the current tier and distance to the next', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.aggregate.mockResolvedValue({ _sum: { totalCoinAmount: 750 } });
    const res = await service.myStanding('c1', 'v1');
    expect(res.tier).toEqual({ key: 'SILVER', label: 'Silver supporter' });
    expect(res.nextTier).toEqual({ key: 'GOLD', label: 'Gold supporter', coinsToGo: 1250 });
  });

  it('reports null nextTier at the top of the ladder', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.aggregate.mockResolvedValue({ _sum: { totalCoinAmount: 50_000 } });
    const res = await service.myStanding('c1', 'v1');
    expect(res.tier?.key).toBe('STAGE');
    expect(res.nextTier).toBeNull();
  });
});

describe('SupportersService.circle', () => {
  it('throws NotFound for an unknown creator', async () => {
    const { service, prisma } = build();
    prisma.creatorProfile.findUnique.mockResolvedValue(null);
    await expect(service.circle('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excludes gifters below the lowest tier and skips the profile lookup when empty', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.groupBy.mockResolvedValue([
      { viewerId: 'small', _sum: { totalCoinAmount: 40 } },
      { viewerId: 'none', _sum: { totalCoinAmount: null } }
    ]);
    const res = await service.circle('c1');
    expect(res).toEqual({ creatorUserId: 'c1', members: [] });
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
  });

  it('ranks tiered members with display-name fallbacks and per-member tiers', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.groupBy.mockResolvedValue([
      { viewerId: 'whale', _sum: { totalCoinAmount: 12_000 } },
      { viewerId: 'fan', _sum: { totalCoinAmount: 600 } },
      { viewerId: 'newbie', _sum: { totalCoinAmount: 120 } },
      { viewerId: 'below', _sum: { totalCoinAmount: 10 } } // filtered out
    ]);
    prisma.profile.findMany.mockResolvedValue([
      { userId: 'whale', displayName: 'Big Whale', username: 'whale' },
      { userId: 'fan', displayName: null, username: 'fan_one' }
    ]);
    const res = await service.circle('c1', 10);
    expect(res.members).toEqual([
      { rank: 1, userId: 'whale', displayName: 'Big Whale', totalCoins: 12_000, tier: { key: 'STAGE', label: 'Stage patron' } },
      { rank: 2, userId: 'fan', displayName: 'fan_one', totalCoins: 600, tier: { key: 'SILVER', label: 'Silver supporter' } },
      { rank: 3, userId: 'newbie', displayName: 'Anonymous', totalCoins: 120, tier: { key: 'BRONZE', label: 'Bronze supporter' } }
    ]);
  });

  it('clamps the limit to 1..100 and defaults a falsy limit to 20', async () => {
    const { service, prisma } = build();
    await service.circle('c1', 999);
    expect(prisma.giftTransaction.groupBy.mock.calls[0][0].take).toBe(100);
    await service.circle('c1', 0);
    expect(prisma.giftTransaction.groupBy.mock.calls[1][0].take).toBe(20);
  });
});
