import { ForbiddenException, Injectable } from '@nestjs/common';
import { ReportPriority, ReportReason, ReportStatus, RoomStatus, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LiveRoomsService } from '../live-rooms/live-rooms.service';
import { CreateReportDto } from './dto/create-report.dto';

const STAFF_ROLES: UserRole[] = [UserRole.MODERATOR, UserRole.PAYOUT_REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN];

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveRooms: LiveRoomsService
  ) {}

  // Only a SUPER_ADMIN may suspend/ban another staff member.
  private async guardStaffTarget(actorRole: UserRole | undefined, targetId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (target && STAFF_ROLES.includes(target.role) && actorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SUPER_ADMIN can action a staff account');
    }
  }

  // Safety reasons auto-escalate: child-safety/self-harm/violence are CRITICAL.
  private static readonly CRITICAL_REASONS: ReportReason[] = [ReportReason.UNDERAGE_RISK, ReportReason.SELF_HARM, ReportReason.VIOLENCE];
  private static readonly HIGH_REASONS: ReportReason[] = [ReportReason.NUDITY, ReportReason.HATE, ReportReason.SCAM, ReportReason.PAYMENT_FRAUD];

  private reportPriority(reason: ReportReason, supplied?: ReportPriority): ReportPriority {
    if (supplied) return supplied;
    if (ModerationService.CRITICAL_REASONS.includes(reason)) return ReportPriority.CRITICAL;
    if (ModerationService.HIGH_REASONS.includes(reason)) return ReportPriority.HIGH;
    return ReportPriority.MEDIUM;
  }

  report(reporterId: string, dto: CreateReportDto) {
    return this.prisma.report.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        roomId: dto.roomId,
        reason: dto.reason,
        details: dto.details,
        priority: this.reportPriority(dto.reason, dto.priority)
      }
    });
  }

  reports(filters: { status?: string; priority?: string; reason?: string } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.reason) where.reason = filters.reason;
    return this.prisma.report.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { reporter: { include: { profile: true } }, targetUser: { include: { profile: true } }, room: true }
    });
  }

  // Map an admin action verb to the resulting report status (ESCALATE also bumps priority).
  private statusForAction(action: string): ReportStatus {
    switch (action) {
      case 'REVIEWING':
      case 'ESCALATE':
        return ReportStatus.REVIEWING;
      case 'DISMISS':
        return ReportStatus.REJECTED;
      default:
        return ReportStatus.ACTIONED;
    }
  }

  async action(moderatorId: string, reportId: string, action: string, reason?: string) {
    const data: { status: ReportStatus; priority?: ReportPriority } = { status: this.statusForAction(action) };
    if (action === 'ESCALATE') data.priority = ReportPriority.CRITICAL;
    const report = await this.prisma.report.update({ where: { id: reportId }, data });
    await this.prisma.moderationAction.create({ data: { moderatorId, reportId, targetUserId: report.targetUserId, roomId: report.roomId, action, reason } });
    await this.audit(moderatorId, `report.${action}`, reportId, { reason });
    return report;
  }

  async suspendUser(actorId: string, id: string, reason?: string, actorRole?: UserRole) {
    await this.guardStaffTarget(actorRole, id);
    const user = await this.prisma.user.update({ where: { id }, data: { status: UserStatus.SUSPENDED } });
    await this.prisma.moderationAction.create({ data: { moderatorId: actorId, targetUserId: id, action: 'USER_SUSPENDED', reason } });
    await this.audit(actorId, 'user.suspended', id, { reason });
    return user;
  }

  async reactivateUser(actorId: string, id: string) {
    const user = await this.prisma.user.update({ where: { id }, data: { status: UserStatus.ACTIVE } });
    await this.prisma.moderationAction.create({ data: { moderatorId: actorId, targetUserId: id, action: 'USER_REACTIVATED' } });
    await this.audit(actorId, 'user.reactivated', id, {});
    return user;
  }

  async banUser(actorId: string, id: string, reason?: string, actorRole?: UserRole) {
    await this.guardStaffTarget(actorRole, id);
    const user = await this.prisma.user.update({ where: { id }, data: { status: UserStatus.BANNED } });
    await this.prisma.moderationAction.create({ data: { moderatorId: actorId, targetUserId: id, action: 'USER_BANNED', reason } });
    await this.audit(actorId, 'user.banned', id, { reason });
    return user;
  }

  async suspendRoom(actorId: string, id: string, reason?: string) {
    const room = await this.prisma.liveRoom.update({ where: { id }, data: { status: RoomStatus.SUSPENDED, endedAt: new Date() } });
    // A suspended room must vanish from the feed NOW, not after the cache TTL.
    this.liveRooms.clearFeedCache();
    await this.prisma.moderationAction.create({ data: { moderatorId: actorId, roomId: id, action: 'ROOM_SUSPENDED', reason } });
    await this.audit(actorId, 'room.suspended', id, { reason });
    return room;
  }

  audit(actorId: string, action: string, target?: string, metadata?: Record<string, any>) {
    return this.prisma.adminAuditLog.create({ data: { actorId, action, target, metadata: metadata || {} } });
  }
}
