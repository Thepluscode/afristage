import { UsersService } from './users.service';

function makeService() {
  const prisma = {
    block: { findMany: jest.fn(), deleteMany: jest.fn() },
    user: { findMany: jest.fn() }
  };
  return { svc: new UsersService(prisma as any), prisma };
}

describe('UsersService block management', () => {
  it('listBlocked returns [] and skips the user query when nothing is blocked', async () => {
    const { svc, prisma } = makeService();
    prisma.block.findMany.mockResolvedValue([]);
    expect(await svc.listBlocked('me')).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('listBlocked shapes safe public fields, prefers stage name, preserves order', async () => {
    const { svc, prisma } = makeService();
    const d1 = new Date('2026-01-02');
    const d2 = new Date('2026-01-01');
    prisma.block.findMany.mockResolvedValue([
      { blockedId: 'u1', createdAt: d1 },
      { blockedId: 'u2', createdAt: d2 }
    ]);
    // Returned out of order to prove we re-key by id, not rely on user query order.
    prisma.user.findMany.mockResolvedValue([
      { id: 'u2', profile: { displayName: 'Bob', avatarUrl: null }, creatorProfile: null },
      { id: 'u1', profile: { displayName: 'Alice', avatarUrl: 'a.png' }, creatorProfile: { stageName: 'DJ Alice' } }
    ]);

    expect(await svc.listBlocked('me')).toEqual([
      { id: 'u1', blockedAt: d1, displayName: 'DJ Alice', avatarUrl: 'a.png' },
      { id: 'u2', blockedAt: d2, displayName: 'Bob', avatarUrl: null }
    ]);
  });

  it('listBlocked tolerates a since-deleted blocked user', async () => {
    const { svc, prisma } = makeService();
    prisma.block.findMany.mockResolvedValue([{ blockedId: 'gone', createdAt: new Date('2026-01-01') }]);
    prisma.user.findMany.mockResolvedValue([]);
    const out = await svc.listBlocked('me');
    expect(out[0]).toMatchObject({ id: 'gone', displayName: 'Unknown user', avatarUrl: null });
  });

  it('unblock is idempotent and returns ok', async () => {
    const { svc, prisma } = makeService();
    prisma.block.deleteMany.mockResolvedValue({ count: 0 });
    expect(await svc.unblock('me', 'x')).toEqual({ ok: true });
    expect(prisma.block.deleteMany).toHaveBeenCalledWith({ where: { blockerId: 'me', blockedId: 'x' } });
  });
});
