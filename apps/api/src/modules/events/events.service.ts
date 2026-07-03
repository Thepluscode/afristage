import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  // Live + upcoming campaigns, soonest first, with their limited-time gifts.
  listCurrent() {
    const now = new Date();
    return this.prisma.event.findMany({
      where: { endsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      include: { gifts: { where: { isActive: true }, orderBy: { coinPrice: 'asc' } } }
    });
  }

  // Event supporter chart: coins gifted VIA the event's limited gifts, inside
  // the event window. Pure aggregation over settled gift transactions — the
  // R2/R4 rule: ranking is a read, never a charge.
  async leaderboard(eventId: string, limit = 20) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100); // bounded 1..100

    const rows = await this.prisma.giftTransaction.groupBy({
      by: ['viewerId'],
      where: {
        gift: { eventId },
        createdAt: { gte: event.startsAt, lte: event.endsAt }
      },
      _sum: { totalCoinAmount: true },
      orderBy: { _sum: { totalCoinAmount: 'desc' } },
      take
    });
    if (!rows.length) return { event: { id: event.id, name: event.name }, supporters: [] };

    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: rows.map((r) => r.viewerId) } },
      select: { userId: true, displayName: true, username: true }
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return {
      event: { id: event.id, name: event.name },
      supporters: rows.map((r, i) => ({
        rank: i + 1,
        userId: r.viewerId,
        displayName: byId.get(r.viewerId)?.displayName ?? byId.get(r.viewerId)?.username ?? 'Anonymous',
        totalCoins: r._sum.totalCoinAmount ?? 0
      }))
    };
  }

  private assertWindow(startsAt: Date, endsAt: Date) {
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  async create(dto: CreateEventDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertWindow(startsAt, endsAt);
    return this.prisma.event.create({ data: { name: dto.name, description: dto.description, startsAt, endsAt } });
  }

  async update(id: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : event.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    this.assertWindow(startsAt, endsAt);
    return this.prisma.event.update({
      where: { id },
      data: { name: dto.name, description: dto.description, startsAt, endsAt }
    });
  }
}
