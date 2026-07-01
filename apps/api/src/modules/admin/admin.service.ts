import { Injectable } from '@nestjs/common';
import { CreatorApprovalStatus, PaymentStatus, PayoutStatus, ReportPriority, ReportStatus, RoomStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // The beta control room: everything an operator must watch during closed beta.
  async betaOpsDashboard() {
    const [
      activeRooms,
      pendingCreatorApprovals,
      pendingReports,
      criticalReports,
      pendingPayouts,
      openSupportTickets,
      paymentFailures,
      bannedUsers
    ] = await Promise.all([
      this.prisma.liveRoom.count({ where: { status: RoomStatus.LIVE } }),
      this.prisma.creatorProfile.count({ where: { approvalStatus: CreatorApprovalStatus.PENDING } }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN, priority: ReportPriority.CRITICAL } }),
      this.prisma.payoutRequest.count({ where: { status: PayoutStatus.UNDER_REVIEW } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      this.prisma.paymentIntent.count({ where: { status: PaymentStatus.FAILED } }),
      this.prisma.user.count({ where: { status: UserStatus.BANNED } })
    ]);
    return {
      activeRooms,
      pendingCreatorApprovals,
      pendingReports,
      criticalReports,
      pendingPayouts,
      openSupportTickets,
      paymentFailures,
      bannedUsers
    };
  }

  async dashboard() {
    const since = new Date();
    since.setHours(0, 0, 0, 0); // start of today (server local)
    const [activeRooms, pendingReports, criticalReports, pendingPayouts, successfulPayments, failedPayments, giftsToday, newUsersToday, newCreatorsToday] = await Promise.all([
      this.prisma.liveRoom.count({ where: { status: RoomStatus.LIVE } }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN, priority: ReportPriority.CRITICAL } }),
      this.prisma.payoutRequest.count({ where: { status: PayoutStatus.UNDER_REVIEW } }),
      this.prisma.paymentIntent.count({ where: { status: PaymentStatus.SUCCEEDED } }),
      this.prisma.paymentIntent.count({ where: { status: PaymentStatus.FAILED } }),
      this.prisma.giftTransaction.aggregate({ _sum: { totalCoinAmount: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.creatorProfile.count({ where: { createdAt: { gte: since } } })
    ]);
    return {
      activeRooms,
      pendingReports,
      criticalReports,
      pendingPayouts,
      successfulPayments,
      failedPayments,
      grossGiftVolumeCoins: (giftsToday._sum.totalCoinAmount || 0).toString(),
      newUsersToday,
      newCreatorsToday
    };
  }

  users(q?: string, status?: string, role?: string) {
    const and: any[] = [];
    if (q) and.push({ OR: [{ email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { profile: { username: { contains: q, mode: 'insensitive' } } }] });
    if (status) and.push({ status });
    if (role) and.push({ role });
    return this.prisma.user.findMany({
      where: and.length ? { AND: and } : {},
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { profile: true, creatorProfile: true }
    });
  }

  creators(approvalStatus?: string) {
    return this.prisma.creatorProfile.findMany({
      where: approvalStatus ? { approvalStatus: approvalStatus as any } : {},
      orderBy: { createdAt: 'desc' },
      include: { user: { include: { profile: true } } }
    });
  }

  liveRooms(status?: string) {
    return this.prisma.liveRoom.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { host: { include: { profile: true, creatorProfile: true } } }
    });
  }

  payments() {
    return this.prisma.paymentIntent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  // Global operator search across the entities reviewers actually look people/things up by.
  // Returns a flat, typed, capped list; each result points at the section that owns it.
  // ponytail: one query per entity, 5 each, no debounce server-side — fine at beta volume.
  async search(q?: string) {
    const term = (q || '').trim();
    if (!term) return [];
    const like = { contains: term, mode: 'insensitive' as const };
    const [users, creators, rooms, reports, payments, payouts, gifts, tickets] = await Promise.all([
      this.prisma.user.findMany({
        where: { OR: [{ email: like }, { phone: { contains: term } }, { profile: { username: like } }, { profile: { displayName: like } }] },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { profile: true }
      }),
      this.prisma.creatorProfile.findMany({
        where: { OR: [{ stageName: like }, { user: { email: like } }] },
        take: 5,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.liveRoom.findMany({ where: { title: like }, take: 5, orderBy: { createdAt: 'desc' } }),
      this.prisma.report.findMany({ where: { details: like }, take: 5, orderBy: { createdAt: 'desc' } }),
      this.prisma.paymentIntent.findMany({ where: { providerReference: like }, take: 5, orderBy: { createdAt: 'desc' } }),
      this.prisma.payoutRequest.findMany({
        where: { OR: [{ providerReference: like }, { payoutDestinationReference: like }] },
        take: 5,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.gift.findMany({ where: { name: like }, take: 5, orderBy: { createdAt: 'desc' } }),
      this.prisma.supportTicket.findMany({
        where: { OR: [{ subject: like }, { description: like }] },
        take: 5,
        orderBy: { createdAt: 'desc' }
      })
    ]);
    return [
      ...users.map((u) => ({
        type: 'user',
        id: u.id,
        label: u.profile?.displayName || u.profile?.username || u.email || u.phone || u.id,
        sublabel: u.email || u.phone || u.role,
        href: `/users?id=${u.id}`
      })),
      ...creators.map((c) => ({ type: 'creator', id: c.id, label: c.stageName, sublabel: c.approvalStatus, href: `/creators?id=${c.id}` })),
      ...rooms.map((r) => ({ type: 'room', id: r.id, label: r.title, sublabel: r.status, href: `/live-rooms?id=${r.id}` })),
      ...reports.map((r) => ({ type: 'report', id: r.id, label: r.reason, sublabel: r.status, href: `/reports?id=${r.id}` })),
      ...payments.map((p) => ({
        type: 'payment',
        id: p.id,
        label: p.providerReference || p.id,
        sublabel: `${p.status} · ${p.coinAmount} coins`,
        href: `/payments?id=${p.id}`
      })),
      ...payouts.map((p) => ({
        type: 'payout',
        id: p.id,
        label: p.payoutDestinationReference || p.providerReference || p.id,
        sublabel: p.status,
        href: `/payouts?id=${p.id}`
      })),
      ...gifts.map((g) => ({ type: 'gift', id: g.id, label: g.name, sublabel: g.isActive ? 'active' : 'inactive', href: `/gifts?id=${g.id}` })),
      ...tickets.map((t) => ({ type: 'ticket', id: t.id, label: t.subject, sublabel: t.status, href: `/support?id=${t.id}` }))
    ];
  }

  ledgerTransactions() {
    return this.prisma.ledgerTransaction.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { entries: { include: { account: true } } } });
  }

  auditLogs() {
    return this.prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
