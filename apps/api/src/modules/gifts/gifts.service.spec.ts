import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GiftsService } from './gifts.service';

const dto = { giftId: 'g1', quantity: 1, idempotencyKey: 'k1' };

function build(overrides: any = {}) {
  const prisma: any = {
    liveRoom: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    gift: { findUnique: jest.fn() },
    giftTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
    ledgerTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
    profile: { findMany: jest.fn().mockResolvedValue([]) }
  };
  const wallet: any = {
    balance: jest.fn().mockResolvedValue('1000'),
    account: jest.fn().mockResolvedValue({ id: 'acc' }),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'sys' })
  };
  const ledger: any = { postTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }) };
  const chat: any = { emitToRoom: jest.fn() };
  prisma.liveRoom.findUnique.mockResolvedValue(overrides.room ?? { id: 'r1', status: 'LIVE', hostUserId: 'creator' });
  prisma.user.findUnique.mockResolvedValue(overrides.viewer ?? { id: 'v1', status: 'ACTIVE' });
  prisma.gift.findUnique.mockResolvedValue(overrides.gift ?? { id: 'g1', isActive: true, coinPrice: 10, name: 'Rose' });
  const service = new GiftsService(prisma, wallet, ledger, chat);
  return { service, prisma, wallet, ledger, chat };
}

describe('GiftsService.send', () => {
  it('rejects a suspended viewer', async () => {
    const { service } = build({ viewer: { id: 'v1', status: 'SUSPENDED' } });
    await expect(service.send('v1', 'r1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a creator gifting their own room', async () => {
    const { service } = build({ room: { id: 'r1', status: 'LIVE', hostUserId: 'v1' } });
    await expect(service.send('v1', 'r1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a gift to a non-live room', async () => {
    const { service } = build({ room: { id: 'r1', status: 'ENDED', hostUserId: 'creator' } });
    await expect(service.send('v1', 'r1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an inactive gift', async () => {
    const { service } = build({ gift: { id: 'g1', isActive: false, coinPrice: 10 } });
    await expect(service.send('v1', 'r1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when balance is insufficient', async () => {
    const { service, wallet } = build();
    wallet.balance.mockResolvedValue('5'); // gift costs 10
    await expect(service.send('v1', 'r1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not create a duplicate GiftTransaction for the same ledger tx', async () => {
    const { service, prisma, chat } = build();
    const existing = { id: 'gt-existing' };
    prisma.giftTransaction.findFirst.mockResolvedValue(existing);
    const result = await service.send('v1', 'r1', dto);
    expect(result).toBe(existing);
    expect(prisma.giftTransaction.create).not.toHaveBeenCalled();
    expect(chat.emitToRoom).not.toHaveBeenCalled(); // idempotent replay must not re-broadcast
  });

  it('idempotent replay returns the prior gift BEFORE the balance check (retry after coins spent)', async () => {
    const { service, prisma, wallet, chat } = build();
    // Coins already spent by the original gift -> balance now insufficient.
    wallet.balance.mockResolvedValue('0');
    prisma.ledgerTransaction.findUnique.mockResolvedValue({ id: 'tx-prior' });
    prisma.giftTransaction.findFirst.mockResolvedValue({ id: 'gt-prior' });
    const result = await service.send('v1', 'r1', dto);
    expect(result).toEqual({ id: 'gt-prior' });
    expect(wallet.balance).not.toHaveBeenCalled(); // short-circuited before the balance guard
    expect(chat.emitToRoom).not.toHaveBeenCalled(); // replay must not re-broadcast
  });

  it('broadcasts gift.sent into the room on a fresh gift', async () => {
    const { service, prisma, chat } = build();
    prisma.giftTransaction.create.mockResolvedValue({ id: 'gt1', createdAt: new Date(0) });
    await service.send('v1', 'r1', dto);
    expect(chat.emitToRoom).toHaveBeenCalledWith(
      'r1',
      'gift.sent',
      expect.objectContaining({ giftTransactionId: 'gt1', giftName: 'Rose', senderId: 'v1', totalCoinAmount: 10 })
    );
  });
});

describe('GiftsService.myGifts', () => {
  it('returns [] and skips the profile lookup when the viewer has sent nothing', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.findMany.mockResolvedValue([]);
    expect(await service.myGifts('v1')).toEqual([]);
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
  });

  it('shapes gift history with gift name, room title, and resolved creator name', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.findMany.mockResolvedValue([
      { id: 'gt1', creatorId: 'creator', roomId: 'r1', quantity: 2, totalCoinAmount: 20, createdAt: new Date(0), gift: { name: 'Rose', animationUrl: 'a.json' }, room: { id: 'r1', title: 'Friday Jam' } }
    ]);
    prisma.profile.findMany.mockResolvedValue([{ userId: 'creator', displayName: 'DJ X' }]);
    expect(await service.myGifts('v1')).toEqual([
      { id: 'gt1', giftName: 'Rose', animationUrl: 'a.json', quantity: 2, totalCoinAmount: 20, roomId: 'r1', roomTitle: 'Friday Jam', creatorId: 'creator', creatorName: 'DJ X', createdAt: new Date(0) }
    ]);
  });

  it('bounds the limit to 1..100', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.findMany.mockResolvedValue([]);
    await service.myGifts('v1', 9999);
    expect(prisma.giftTransaction.findMany.mock.calls[0][0].take).toBe(100);
  });
});

describe('GiftsService.topGifters', () => {
  it('ranks gifters by total coins and attaches display names', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.groupBy.mockResolvedValue([
      { viewerId: 'whale', _sum: { totalCoinAmount: 5000, quantity: 12 } },
      { viewerId: 'fan', _sum: { totalCoinAmount: 800, quantity: 3 } }
    ]);
    prisma.profile.findMany.mockResolvedValue([
      { userId: 'whale', displayName: 'Big Whale', username: 'whale' },
      { userId: 'fan', displayName: null, username: 'fan_one' }
    ]);
    const res = await service.topGifters('r1', 10);
    expect(res).toEqual([
      { rank: 1, viewerId: 'whale', displayName: 'Big Whale', totalCoins: 5000, giftCount: 12 },
      { rank: 2, viewerId: 'fan', displayName: 'fan_one', totalCoins: 800, giftCount: 3 } // falls back to username
    ]);
    // ordering is delegated to the DB (orderBy _sum desc) + bounded take
    expect(prisma.giftTransaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: 'r1' }, orderBy: { _sum: { totalCoinAmount: 'desc' } }, take: 10 })
    );
  });

  it('returns an empty array for a room with no gifts', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.groupBy.mockResolvedValue([]);
    expect(await service.topGifters('r1')).toEqual([]);
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
  });

  it('clamps the limit to 1..50', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.groupBy.mockResolvedValue([]);
    await service.topGifters('r1', 999);
    expect(prisma.giftTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    await service.topGifters('r1', 0);
    expect(prisma.giftTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 10 })); // 0 -> default 10
  });
});
