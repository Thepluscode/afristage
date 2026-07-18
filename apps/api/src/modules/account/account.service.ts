import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';

// Data lives 30 days after soft-delete for a compliance review / accidental-
// deletion reversal, then purgeExpired() hard-deletes it. See docs/account-deletion.md.
export const RETENTION_DAYS = 30;

// Deletion is a business process, not a button. This service owns the full
// lifecycle: soft-delete (deactivate + retain), GDPR export (Art. 15), and the
// ordered hard-delete that erases PII while retaining anonymised financial records.
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Legal deletion deadlines shouldn't depend on a human running the checklist,
  // so the sweep also runs daily via the already-registered ScheduleModule.
  // ponytail: in-app @Cron over the installed scheduler; move to a dedicated
  // worker only if purge volume ever needs isolating from the API process.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledPurge() {
    try {
      const r = await this.purgeExpired();
      if (r.purged) this.logger.log(`retention sweep: hard-deleted ${r.purged} expired account(s)`);
    } catch (e) {
      this.logger.error(`retention sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deactivate immediately; retain all data for the retention window. Kills every
  // session (revoke rows + tokenVersion bump) so the user is out of the app now.
  // Idempotent: a second call on an already-DELETED account is a no-op.
  async softDelete(userId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === 'DELETED') return { ok: true, alreadyDeleted: true };
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: 'DELETED', deletedAt: new Date(), tokenVersion: { increment: 1 } }
      }),
      this.prisma.deviceSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.adminAuditLog.create({
        data: { actorId, action: 'account.soft_delete', target: userId, metadata: { self: actorId === userId } }
      })
    ]);
    return { ok: true };
  }

  // Self-service delete: re-check the password (defends a hijacked session) then soft-delete.
  async selfDelete(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: false }
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new BadRequestException('Password is incorrect');
    }
    return this.softDelete(userId, userId);
  }

  // GDPR Art. 15 report: everything held on the user. Credentials are globally
  // omitted by PrismaService; internal admin notes are excluded.
  async export(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, creatorProfile: true }
    });
    if (!user) throw new NotFoundException('User not found');

    const [
      follows, blocks, hostedRooms, participation, chatMessages, gifts, payments,
      payoutMethods, payoutRequests, wallets, notifications, notificationPrefs,
      missionClaims, tickets, ticketMessages, reportsMade, sessions
    ] = await Promise.all([
      this.prisma.follow.findMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } }),
      this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
      this.prisma.liveRoom.findMany({ where: { hostUserId: userId } }),
      this.prisma.roomParticipant.findMany({ where: { userId } }),
      this.prisma.chatMessage.findMany({ where: { senderId: userId } }),
      this.prisma.giftTransaction.findMany({ where: { viewerId: userId } }),
      this.prisma.paymentIntent.findMany({ where: { userId } }),
      this.prisma.payoutMethod.findMany({ where: { userId } }),
      this.prisma.payoutRequest.findMany({ where: { creatorUserId: userId } }),
      this.prisma.walletAccount.findMany({ where: { userId } }),
      this.prisma.notification.findMany({ where: { userId } }),
      this.prisma.notificationPreference.findMany({ where: { userId } }),
      this.prisma.missionClaim.findMany({ where: { userId } }),
      this.prisma.supportTicket.findMany({ where: { requesterId: userId } }),
      this.prisma.supportTicketMessage.findMany({ where: { senderId: userId, internal: false } }),
      this.prisma.report.findMany({ where: { reporterId: userId } }),
      this.prisma.deviceSession.findMany({ where: { userId } })
    ]);

    return {
      generatedAt: new Date(),
      user,
      follows, blocks, hostedRooms, participation, chatMessages, gifts, payments,
      payoutMethods, payoutRequests, wallets, notifications, notificationPrefs,
      missionClaims, tickets, ticketMessages, reportsMade, sessions
    };
  }

  // Irreversible erasure, ordered so every retain/anonymise decision is explicit.
  // Financial records are retained anonymised (wallet userId nulled → ledger intact;
  // the User row survives as a PII-free tombstone the non-nullable financial FKs
  // point at). See the cascade map in docs/account-deletion.md.
  async hardDelete(userId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.$transaction(async (tx) => {
      // Financial records (wallets, ledger, payments, gifts, payouts) are RETAINED,
      // linked to the now-PII-free User tombstone — accounting/tax retention. We do
      // NOT null wallet.userId: it isn't PII, and doing so collides with the partial
      // unique index that allows one system wallet per (accountType, currency).
      // Null nullable moderation/review links — keep the moderation trail, drop the person.
      await tx.report.updateMany({ where: { targetUserId: userId }, data: { targetUserId: null } });
      await tx.moderationAction.updateMany({ where: { targetUserId: userId }, data: { targetUserId: null } });
      await tx.payoutRequest.updateMany({ where: { reviewedBy: userId }, data: { reviewedBy: null } });
      await tx.creatorProfile.updateMany({ where: { reviewedById: userId }, data: { reviewedById: null } });
      // Delete purely-personal peripheral rows.
      await tx.deviceSession.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await tx.roomReminder.deleteMany({ where: { userId } });
      await tx.roomMute.deleteMany({ where: { userId } });
      await tx.roomParticipant.deleteMany({ where: { userId } });
      await tx.missionClaim.deleteMany({ where: { userId } });
      await tx.circleMember.deleteMany({ where: { userId } });
      await tx.creatorStreamStat.deleteMany({ where: { creatorUserId: userId } });
      await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.chatMessage.deleteMany({ where: { senderId: userId } });
      await tx.payoutMethod.deleteMany({ where: { userId } }); // bank details — must go
      await tx.fraudAssessment.deleteMany({ where: { userId } });
      await tx.agencyCreator.deleteMany({ where: { creatorUserId: userId } });
      await tx.report.deleteMany({ where: { reporterId: userId } });
      await tx.supportTicketMessage.deleteMany({ where: { senderId: userId } });
      await tx.supportTicket.deleteMany({ where: { requesterId: userId } });
      // Anonymise the profile rows (keep so history renders "Deleted user").
      await tx.profile.updateMany({
        where: { userId },
        data: { displayName: 'Deleted user', username: `deleted_${userId}`, avatarUrl: null, bio: null, country: null, city: null }
      });
      await tx.creatorProfile.updateMany({ where: { userId }, data: { stageName: 'Deleted creator' } });
      // Scrub the User tombstone of all PII; keep the row for financial FKs.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: null, phone: null, passwordHash: null,
          emailVerified: false, phoneVerified: false,
          mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [],
          passwordResetTokenHash: null, passwordResetExpiresAt: null,
          status: 'DELETED', deletedAt: user.deletedAt ?? new Date(), purgedAt: new Date()
        }
      });
      await tx.adminAuditLog.create({ data: { actorId, action: 'account.hard_delete', target: userId, metadata: {} } });
    });
    return { ok: true };
  }

  // The 30-day sweep. Called from ops/cron, not a scheduler service.
  // ponytail: sweep from ops/cron; real scheduler when volume needs it.
  async purgeExpired(now = new Date()) {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
    const due = await this.prisma.user.findMany({
      where: { status: 'DELETED', deletedAt: { lt: cutoff }, purgedAt: null },
      select: { id: true }
    });
    for (const u of due) await this.hardDelete(u.id, 'system');
    return { purged: due.length, ids: due.map((u) => u.id) };
  }
}
