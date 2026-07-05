import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { CreateCircleDto } from './dto/create-circle.dto';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

@Injectable()
export class CirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agg: AggregationService
  ) {}

  // Circle points are pure AGGREGATION over members' existing activity:
  // coins gifted by members + mission rewards claimed by members. No circle
  // ever touches the money path — it only reads it. (Wash-trading a circle's
  // points is exactly what the group fraud scorer detects — see assessment.)
  private async points(memberIds: string[], since?: Date) {
    if (!memberIds.length) return { giftPoints: 0, missionPoints: 0, total: 0 };
    const [giftPoints, missionPoints] = await Promise.all([
      this.agg.sumGiftCoins({ viewerId: { in: memberIds } }, since),
      this.agg.sumMissionCoins(memberIds, since)
    ]);
    return { giftPoints, missionPoints, total: giftPoints + missionPoints };
  }

  async create(userId: string, dto: CreateCircleDto) {
    const existing = await this.prisma.circleMember.findUnique({ where: { userId } });
    if (existing) throw new BadRequestException('You already belong to a circle — leave it first');
    const circle = await this.prisma.circle.create({
      data: {
        name: dto.name,
        description: dto.description,
        city: dto.city,
        createdById: userId,
        members: { create: { userId, role: 'OWNER' } }
      },
      include: { members: true }
    });
    return circle;
  }

  // Browse: recent circles with member counts (discovery surface).
  list(limit = 20) {
    const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
    return this.prisma.circle.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { _count: { select: { members: true } } }
    });
  }

  // The caller's circle (with their role), or null.
  async mine(userId: string) {
    const membership = await this.prisma.circleMember.findUnique({
      where: { userId },
      include: { circle: { include: { _count: { select: { members: true } } } } }
    });
    if (!membership) return { circle: null };
    return { circle: membership.circle, role: membership.role, joinedAt: membership.joinedAt };
  }

  async join(userId: string, circleId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    const existing = await this.prisma.circleMember.findUnique({ where: { userId } });
    if (existing) {
      if (existing.circleId === circleId) return { ok: true, alreadyMember: true };
      throw new BadRequestException('You already belong to a circle — leave it first');
    }
    await this.prisma.circleMember.create({ data: { circleId, userId } });
    return { ok: true, alreadyMember: false };
  }

  // Leaving: an OWNER may only leave as the last member, which deletes the
  // circle (no orphaned leaderless groups); members leave freely.
  async leave(userId: string) {
    const membership = await this.prisma.circleMember.findUnique({ where: { userId } });
    if (!membership) throw new BadRequestException('You are not in a circle');
    if (membership.role === 'OWNER') {
      const others = await this.prisma.circleMember.count({ where: { circleId: membership.circleId, userId: { not: userId } } });
      if (others > 0) throw new BadRequestException('Owners cannot leave while the circle has members');
      await this.prisma.circleMember.delete({ where: { userId } });
      await this.prisma.circle.delete({ where: { id: membership.circleId } });
      return { ok: true, circleDeleted: true };
    }
    await this.prisma.circleMember.delete({ where: { userId } });
    return { ok: true, circleDeleted: false };
  }

  // Detail: members with names/roles + all-time and last-7-day points.
  async detail(circleId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId }, include: { members: true } });
    if (!circle) throw new NotFoundException('Circle not found');
    const memberIds = circle.members.map((m) => m.userId);
    const [byId, allTime, week] = await Promise.all([
      this.agg.profilesFor(memberIds),
      this.points(memberIds),
      this.points(memberIds, new Date(Date.now() - WEEK_MS))
    ]);
    return {
      id: circle.id,
      name: circle.name,
      description: circle.description,
      city: circle.city,
      points: { allTime, week },
      members: circle.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        displayName: byId.get(m.userId)?.displayName ?? byId.get(m.userId)?.username ?? 'Anonymous',
        joinedAt: m.joinedAt
      }))
    };
  }

  // Circle charts. ponytail: aggregates per circle in a loop — fine at beta
  // circle counts; materialise per window via the R5 §6 aggregation engine
  // when circles grow.
  async leaderboard(window: string = 'week', limit = 20) {
    const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
    const since = window === 'all' ? undefined : new Date(Date.now() - WEEK_MS);
    const circles = await this.prisma.circle.findMany({ include: { members: { select: { userId: true } } } });
    const scored = await Promise.all(
      circles.map(async (c) => {
        const pts = await this.points(c.members.map((m) => m.userId), since);
        return { id: c.id, name: c.name, city: c.city, memberCount: c.members.length, points: pts.total };
      })
    );
    return scored
      .sort((a, b) => b.points - a.points)
      .slice(0, take)
      .map((c, i) => ({ rank: i + 1, ...c }));
  }

  // Member ids for the admin fraud assessment (R4 §7 guardrail: circle-scoped
  // prizes/points must be reviewable through the group scorer).
  async memberIds(circleId: string): Promise<string[]> {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId }, include: { members: { select: { userId: true } } } });
    if (!circle) throw new NotFoundException('Circle not found');
    return circle.members.map((m) => m.userId);
  }
}
