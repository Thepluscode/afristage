import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';

function makeService() {
  const prisma = {
    block: { findMany: jest.fn(), deleteMany: jest.fn() },
    user: { findMany: jest.fn() },
    follow: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
    profile: { findUnique: jest.fn() }
  };
  const notifications = { notifyUser: jest.fn().mockResolvedValue({}) };
  return { svc: new UsersService(prisma as any, notifications as any), prisma, notifications };
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

  it('notifies the followed user on a new follow', async () => {
    const { svc, prisma, notifications } = makeService();
    prisma.follow.create.mockResolvedValue({ id: 'f1', followerId: 'a', followingId: 'b' });
    prisma.profile.findUnique.mockResolvedValue({ displayName: 'Ada' });
    await svc.follow('a', 'b');
    expect(notifications.notifyUser).toHaveBeenCalledWith('b', 'NEW_FOLLOWER', 'New follower', 'Ada started following you.');
  });

  it('does not notify on a re-follow (already following)', async () => {
    const { svc, prisma, notifications } = makeService();
    prisma.follow.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    prisma.follow.findUniqueOrThrow.mockResolvedValue({ id: 'f1' });
    await svc.follow('a', 'b');
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('rejects following yourself', async () => {
    const { svc, prisma } = makeService();
    await expect(svc.follow('a', 'a')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.follow.create).not.toHaveBeenCalled();
  });

  it('a failed follower notification still completes the follow', async () => {
    const { svc, prisma, notifications } = makeService();
    prisma.follow.create.mockResolvedValue({ id: 'f1' });
    notifications.notifyUser.mockRejectedValue(new Error('notif down'));
    await expect(svc.follow('a', 'b')).resolves.toMatchObject({ id: 'f1' });
  });

  it('unblock is idempotent and returns ok', async () => {
    const { svc, prisma } = makeService();
    prisma.block.deleteMany.mockResolvedValue({ count: 0 });
    expect(await svc.unblock('me', 'x')).toEqual({ ok: true });
    expect(prisma.block.deleteMany).toHaveBeenCalledWith({ where: { blockerId: 'me', blockedId: 'x' } });
  });
});

describe('UsersService basics', () => {
  function svc2() {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      profile: { update: jest.fn().mockResolvedValue({ userId: 'u1' }), findUnique: jest.fn() },
      follow: { create: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn() },
      block: { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) }
    };
    const notifications: any = { notifyUser: jest.fn() };
    return { svc: new UsersService(prisma, notifications), prisma };
  }

  it('me includes profile + creatorProfile', async () => {
    const { svc, prisma } = svc2();
    await svc.me('u1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, include: { profile: true, creatorProfile: true } })
    );
  });

  it('updateProfile updates the profile row', async () => {
    const { svc, prisma } = svc2();
    await svc.updateProfile('u1', { displayName: 'X' } as any);
    expect(prisma.profile.update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
  });

  it('unfollow is idempotent', async () => {
    const { svc } = svc2();
    expect(await svc.unfollow('a', 'b')).toEqual({ ok: true });
  });

  it('block upserts a block row', async () => {
    const { svc, prisma } = svc2();
    await svc.block('a', 'b');
    expect(prisma.block.upsert).toHaveBeenCalled();
  });

  it('follow rethrows a non-unique-violation error', async () => {
    const { svc, prisma } = svc2();
    prisma.follow.create.mockRejectedValue(new Error('db down'));
    await expect(svc.follow('a', 'b')).rejects.toThrow('db down');
  });
});
