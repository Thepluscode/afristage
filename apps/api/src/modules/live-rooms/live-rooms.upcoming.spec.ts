import { LiveRoomsService } from './live-rooms.service';

function build() {
  const prisma: any = { liveRoom: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new LiveRoomsService(prisma, {} as any, {} as any);
  return { service, prisma };
}

describe('LiveRoomsService.upcoming', () => {
  it('queries SCHEDULED rooms with a future start, soonest first', async () => {
    const { service, prisma } = build();
    await service.upcoming(20);
    const arg = prisma.liveRoom.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe('SCHEDULED');
    expect(arg.where.scheduledStartAt.gte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ scheduledStartAt: 'asc' });
    expect(arg.take).toBe(20);
  });

  it('bounds the limit to 1..100', async () => {
    const { service, prisma } = build();
    await service.upcoming(9999);
    expect(prisma.liveRoom.findMany.mock.calls[0][0].take).toBe(100);
    await service.upcoming(0); // 0 -> default 50
    expect(prisma.liveRoom.findMany.mock.calls[1][0].take).toBe(50);
  });
});
