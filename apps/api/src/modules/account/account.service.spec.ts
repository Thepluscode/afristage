import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AccountService, RETENTION_DAYS } from './account.service';

// A prisma double where every model has the CRUD methods the service touches.
// $transaction handles both call shapes: an array (softDelete) resolves all;
// a callback (hardDelete) is invoked with the same mock as its tx client, so
// assertions can target prisma.<model>.<method> directly.
function makePrisma() {
  const model = () => ({
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({})
  });
  const p: any = {};
  for (const m of [
    'user', 'profile', 'creatorProfile', 'follow', 'block', 'roomReminder', 'roomParticipant',
    'roomMute', 'chatMessage', 'missionClaim', 'circleMember', 'creatorStreamStat', 'notification',
    'notificationPreference', 'deviceSession', 'fraudAssessment', 'agencyCreator', 'payoutMethod',
    'payoutRequest', 'walletAccount', 'liveRoom', 'giftTransaction', 'paymentIntent', 'report',
    'moderationAction', 'supportTicket', 'supportTicketMessage', 'adminAuditLog'
  ]) p[m] = model();
  p.$transaction = jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(p)));
  return p;
}

describe('AccountService', () => {
  let prisma: any;
  let service: AccountService;
  beforeEach(() => {
    prisma = makePrisma();
    service = new AccountService(prisma);
  });

  describe('softDelete', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.softDelete('u1', 'a1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is a no-op on an already-deleted account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'DELETED' });
      expect(await service.softDelete('u1', 'a1')).toEqual({ ok: true, alreadyDeleted: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('deactivates, kills sessions, and audits an admin-initiated delete', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE' });
      expect(await service.softDelete('u1', 'admin1')).toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ status: 'DELETED', tokenVersion: { increment: 1 } }) })
      );
      expect(prisma.user.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(prisma.deviceSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'account.soft_delete', metadata: { self: false } }) })
      );
    });

    it('marks a self-initiated delete in the audit metadata', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE' });
      await service.softDelete('u1', 'u1');
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ metadata: { self: true } }) })
      );
    });
  });

  describe('selfDelete', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.selfDelete('u1', 'pw')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an account with no password set', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
      await expect(service.selfDelete('u1', 'pw')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects the wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await bcrypt.hash('right', 4), status: 'ACTIVE' });
      await expect(service.selfDelete('u1', 'wrong')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('soft-deletes on the correct password (actor = self)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await bcrypt.hash('right', 4), status: 'ACTIVE' });
      expect(await service.selfDelete('u1', 'right')).toEqual({ ok: true });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ metadata: { self: true } }) })
      );
    });
  });

  describe('export', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.export('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns a report and excludes internal support notes', async () => {
      const user = { id: 'u1', email: 'v@a.live' };
      prisma.user.findUnique.mockResolvedValue(user);
      const report = await service.export('u1');
      expect(report.user).toBe(user);
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.follows).toEqual([]);
      expect(prisma.giftTransaction.findMany).toHaveBeenCalledWith({ where: { viewerId: 'u1' } });
      expect(prisma.supportTicketMessage.findMany).toHaveBeenCalledWith({ where: { senderId: 'u1', internal: false } });
    });
  });

  describe('hardDelete', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.hardDelete('u1', 'a1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retains anonymised financials, deletes personal rows, preserves the original deletedAt', async () => {
      const original = new Date('2026-01-01T00:00:00Z');
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', deletedAt: original });
      expect(await service.hardDelete('u1', 'a1')).toEqual({ ok: true });
      // financial records retained untouched — the wallet is NOT modified (nulling
      // userId would collide with the system-wallet unique index)
      expect(prisma.walletAccount.updateMany).not.toHaveBeenCalled();
      // bank details deleted
      expect(prisma.payoutMethod.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      // moderation link nulled, not the record
      expect(prisma.report.updateMany).toHaveBeenCalledWith({ where: { targetUserId: 'u1' }, data: { targetUserId: null } });
      // profile anonymised
      expect(prisma.profile.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ username: 'deleted_u1', displayName: 'Deleted user' }) }));
      // tombstone scrubbed, original deletedAt kept, purgedAt stamped
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: null, passwordHash: null, deletedAt: original }) }));
      expect(prisma.user.update.mock.calls[0][0].data.purgedAt).toBeInstanceOf(Date);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'account.hard_delete' }) }));
    });

    it('stamps deletedAt when hard-deleting a never-soft-deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', deletedAt: null });
      await service.hardDelete('u1', 'a1');
      expect(prisma.user.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('purgeExpired', () => {
    it('queries the 30-day cutoff and returns nothing when none are due', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const now = new Date('2026-02-01T00:00:00Z');
      expect(await service.purgeExpired(now)).toEqual({ purged: 0, ids: [] });
      const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
      expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { status: 'DELETED', deletedAt: { lt: cutoff }, purgedAt: null }, select: { id: true } });
    });

    it('defaults the cutoff to now when called with no argument', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      expect(await service.purgeExpired()).toEqual({ purged: 0, ids: [] });
    });

    it('hard-deletes every due account as the system actor', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      prisma.user.findUnique.mockResolvedValue({ id: 'x', deletedAt: new Date('2026-01-01') });
      expect(await service.purgeExpired(new Date('2026-03-01'))).toEqual({ purged: 2, ids: ['a', 'b'] });
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: 'system' }) }));
    });
  });

  describe('scheduledPurge', () => {
    it('logs when it purged something', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      jest.spyOn(service, 'purgeExpired').mockResolvedValue({ purged: 2, ids: ['a', 'b'] });
      await service.scheduledPurge();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('2'));
      log.mockRestore();
    });

    it('stays quiet when nothing was due', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      jest.spyOn(service, 'purgeExpired').mockResolvedValue({ purged: 0, ids: [] });
      await service.scheduledPurge();
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });

    it('logs the message when the sweep throws an Error', async () => {
      const err = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest.spyOn(service, 'purgeExpired').mockRejectedValue(new Error('db down'));
      await service.scheduledPurge();
      expect(err).toHaveBeenCalledWith(expect.stringContaining('db down'));
      err.mockRestore();
    });

    it('stringifies a non-Error rejection', async () => {
      const err = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest.spyOn(service, 'purgeExpired').mockRejectedValue('boom');
      await service.scheduledPurge();
      expect(err).toHaveBeenCalledWith(expect.stringContaining('boom'));
      err.mockRestore();
    });
  });
});
