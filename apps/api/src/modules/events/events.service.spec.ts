import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

function build() {
  const prisma: any = {
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'e1', ...data })),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'e1', ...data }))
    },
    giftTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
    profile: { findMany: jest.fn().mockResolvedValue([]) }
  };
  return { service: new EventsService(prisma), prisma };
}

const event = { id: 'e1', name: 'Afrobeats Night', startsAt: new Date('2026-07-01T00:00:00Z'), endsAt: new Date('2026-07-10T00:00:00Z') };

describe('EventsService.listCurrent', () => {
  it('lists live + upcoming events with their active gifts, soonest first', async () => {
    const { service, prisma } = build();
    await service.listCurrent();
    const call = prisma.event.findMany.mock.calls[0][0];
    expect(call.where.endsAt.gte).toBeInstanceOf(Date);
    expect(call.orderBy).toEqual({ startsAt: 'asc' });
    expect(call.include.gifts.where).toEqual({ isActive: true });
  });
});

describe('EventsService.leaderboard', () => {
  it('throws NotFound for an unknown event', async () => {
    const { service } = build();
    await expect(service.leaderboard('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns an empty supporter list without a profile lookup', async () => {
    const { service, prisma } = build();
    prisma.event.findUnique.mockResolvedValue(event);
    const res = await service.leaderboard('e1');
    expect(res).toEqual({ event: { id: 'e1', name: 'Afrobeats Night' }, supporters: [] });
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
  });

  it('ranks supporters by event-gift coins inside the window, with name fallbacks', async () => {
    const { service, prisma } = build();
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.giftTransaction.groupBy.mockResolvedValue([
      { viewerId: 'a', _sum: { totalCoinAmount: 500 } },
      { viewerId: 'b', _sum: { totalCoinAmount: 300 } },
      { viewerId: 'c', _sum: { totalCoinAmount: null } }
    ]);
    prisma.profile.findMany.mockResolvedValue([
      { userId: 'a', displayName: 'Ada', username: 'ada' },
      { userId: 'b', displayName: null, username: 'bee' }
    ]);
    const res = await service.leaderboard('e1', 10);
    expect(res.supporters).toEqual([
      { rank: 1, userId: 'a', displayName: 'Ada', totalCoins: 500 },
      { rank: 2, userId: 'b', displayName: 'bee', totalCoins: 300 }, // username fallback
      { rank: 3, userId: 'c', displayName: 'Anonymous', totalCoins: 0 } // missing profile + null sum
    ]);
    const where = prisma.giftTransaction.groupBy.mock.calls[0][0].where;
    expect(where).toEqual({ gift: { eventId: 'e1' }, createdAt: { gte: event.startsAt, lte: event.endsAt } });
  });

  it('clamps the limit to 1..100 and defaults a falsy limit to 20', async () => {
    const { service, prisma } = build();
    prisma.event.findUnique.mockResolvedValue(event);
    await service.leaderboard('e1', 999);
    expect(prisma.giftTransaction.groupBy.mock.calls[0][0].take).toBe(100);
    await service.leaderboard('e1', 0);
    expect(prisma.giftTransaction.groupBy.mock.calls[1][0].take).toBe(20);
  });
});

describe('EventsService create/update', () => {
  it('creates an event with a valid window', async () => {
    const { service, prisma } = build();
    await service.create({ name: 'Comedy Room', startsAt: '2026-08-01T18:00:00Z', endsAt: '2026-08-01T22:00:00Z' });
    const data = prisma.event.create.mock.calls[0][0].data;
    expect(data.startsAt).toBeInstanceOf(Date);
    expect(data.endsAt.getTime()).toBeGreaterThan(data.startsAt.getTime());
  });

  it('rejects an inverted or zero-length window on create and update', async () => {
    const { service, prisma } = build();
    await expect(
      service.create({ name: 'Bad', startsAt: '2026-08-02T00:00:00Z', endsAt: '2026-08-01T00:00:00Z' })
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.event.findUnique.mockResolvedValue(event);
    await expect(service.update('e1', { endsAt: '2026-06-01T00:00:00Z' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update throws NotFound for an unknown event and merges partial fields', async () => {
    const { service, prisma } = build();
    await expect(service.update('ghost', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    prisma.event.findUnique.mockResolvedValue(event);
    await service.update('e1', { name: 'Renamed' }); // window fields fall back to existing
    const data = prisma.event.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: 'Renamed', startsAt: event.startsAt, endsAt: event.endsAt });
    // and a supplied startsAt is parsed and used
    await service.update('e1', { startsAt: '2026-07-02T00:00:00Z' });
    expect(prisma.event.update.mock.calls[1][0].data.startsAt.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });
});
