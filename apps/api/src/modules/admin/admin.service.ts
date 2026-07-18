import { Injectable } from '@nestjs/common';
import { CreatorApprovalStatus, PaymentStatus, PayoutStatus, ReportPriority, ReportStatus, RoomStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AggregationService, windowSince } from '../aggregation/aggregation.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agg: AggregationService
  ) {}

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

  // Per-user retention view: last meaningful activity + this-window action
  // count, quietest habitual users first. "Meaningful action" = joined a room,
  // sent a gift, or claimed a mission (not a bare login). Session recency counts
  // toward last-active but not toward the action tally. This is the measurement
  // foundation for later personal-baseline anomaly detection — the raw events
  // already accrue; this only rolls them up per user.
  // ponytail: in-app merge over a bounded user set (take 500). At beta scale
  // this is 8 group-bys on small tables; move to a SQL rollup if users grow.
  async userActivity(days = 7) {
    const n = Math.min(Math.max(Math.trunc(days) || 7, 1), 90); // bounded 1..90
    const windowStart = new Date(Date.now() - n * 86_400_000);

    const [users, roomAll, giftAll, missionAll, sessionAll, roomWk, giftWk, missionWk] = await Promise.all([
      this.prisma.user.findMany({
        take: 500,
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, phone: true, role: true, status: true, createdAt: true, profile: { select: { displayName: true, username: true } } }
      }),
      this.prisma.roomParticipant.groupBy({ by: ['userId'], _max: { joinedAt: true } }),
      this.prisma.giftTransaction.groupBy({ by: ['viewerId'], _max: { createdAt: true } }),
      this.prisma.missionClaim.groupBy({ by: ['userId'], _max: { createdAt: true } }),
      this.prisma.deviceSession.groupBy({ by: ['userId'], _max: { lastSeenAt: true } }),
      this.prisma.roomParticipant.groupBy({ by: ['userId'], _count: { _all: true }, where: { joinedAt: { gte: windowStart } } }),
      this.prisma.giftTransaction.groupBy({ by: ['viewerId'], _count: { _all: true }, where: { createdAt: { gte: windowStart } } }),
      this.prisma.missionClaim.groupBy({ by: ['userId'], _count: { _all: true }, where: { createdAt: { gte: windowStart } } })
    ]);

    const roomT = new Map(roomAll.map((r) => [r.userId, r._max.joinedAt]));
    const giftT = new Map(giftAll.map((r) => [r.viewerId, r._max.createdAt]));
    const missionT = new Map(missionAll.map((r) => [r.userId, r._max.createdAt]));
    const sessionT = new Map(sessionAll.map((r) => [r.userId, r._max.lastSeenAt]));
    const roomC = new Map(roomWk.map((r) => [r.userId, r._count._all]));
    const giftC = new Map(giftWk.map((r) => [r.viewerId, r._count._all]));
    const missionC = new Map(missionWk.map((r) => [r.userId, r._count._all]));

    const now = Date.now();
    const rows = users.map((u) => {
      const stamps = [roomT.get(u.id), giftT.get(u.id), missionT.get(u.id), sessionT.get(u.id)].filter(Boolean) as Date[];
      const lastActiveAt = stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null;
      const rooms = roomC.get(u.id) ?? 0;
      const gifts = giftC.get(u.id) ?? 0;
      const missions = missionC.get(u.id) ?? 0;
      return {
        id: u.id,
        displayName: u.profile?.displayName || u.profile?.username || u.email || u.phone || u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        lastActiveAt,
        daysSinceActive: lastActiveAt ? Math.floor((now - lastActiveAt.getTime()) / 86_400_000) : null,
        weekActions: rooms + gifts + missions,
        weekBreakdown: { rooms, gifts, missions }
      };
    });

    // Quietest habitual users first: those who WERE active, longest-ago first,
    // then never-active accounts (an activation gap, not a retention one) by
    // signup order. Partition instead of a branchy comparator so ordering is
    // deterministic.
    const active = rows.filter((r) => r.lastActiveAt).sort((a, b) => a.lastActiveAt!.getTime() - b.lastActiveAt!.getTime());
    const neverActive = rows.filter((r) => !r.lastActiveAt).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { windowDays: n, generatedAt: new Date(), users: [...active, ...neverActive] };
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

  // Regional/gift charts. Pure aggregation over settled gift transactions
  // (gifts are non-reversible in the current model, so every row is settled):
  //   creators   → who RECEIVED the most gift coins (group by creatorId)
  //   supporters → who SENT the most gift coins (group by viewerId)
  // over a time window. ponytail: computed on-demand; materialise per window if
  // chart traffic grows (see docs/reverse-engineering/R5 §6).
  async leaderboard(type = 'creator', window = 'week', limit = 20) {
    const scope: 'creator' | 'supporter' = type === 'supporter' ? 'supporter' : 'creator';
    const rows = await this.agg.giftTotals({
      by: scope === 'creator' ? 'creatorId' : 'viewerId',
      since: windowSince(window),
      limit
    });

    // Admin charts label by stageName-first (creators) with email as a final
    // fallback — richer than the public profilesFor policy, so it stays here.
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.key) } },
      include: { profile: true, creatorProfile: true }
    });
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));

    return rows.map((r, i) => {
      const u = byId[r.key];
      const label =
        scope === 'creator'
          ? u?.creatorProfile?.stageName || u?.profile?.displayName || u?.profile?.username || u?.email || r.key
          : u?.profile?.displayName || u?.profile?.username || u?.email || r.key;
      return { rank: i + 1, userId: r.key, label, totalCoins: r.totalCoins };
    });
  }
}
