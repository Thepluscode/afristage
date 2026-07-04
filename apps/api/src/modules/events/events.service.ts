import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionType, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

// Prize split for the top supporters, in basis points of the pool.
// ponytail: fixed 50/30/20 top-3 schedule; make it per-event config when ops asks.
export const PRIZE_SHARES_BPS = [5000, 3000, 2000];

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly ledger: LedgerService
  ) {}

  // Admin view: every event newest-first (ended and settled included) — the
  // settle action targets events the public listCurrent() filter hides.
  listAll() {
    return this.prisma.event.findMany({
      orderBy: { startsAt: 'desc' },
      take: 100,
      include: { _count: { select: { gifts: true } } }
    });
  }

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
    return this.prisma.event.create({
      data: { name: dto.name, description: dto.description, startsAt, endsAt, prizePoolCoins: dto.prizePoolCoins ?? 0 }
    });
  }

  async update(id: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.settledAt) throw new BadRequestException('Event is settled and can no longer be edited');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : event.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    this.assertWindow(startsAt, endsAt);
    return this.prisma.event.update({
      where: { id },
      data: { name: dto.name, description: dto.description, startsAt, endsAt, prizePoolCoins: dto.prizePoolCoins }
    });
  }

  // Settle the prize pool: one balanced ledger post PROMO -> winners' COIN,
  // split 50/30/20 over the event leaderboard. Reuses the missions money path
  // (PROMO is funded from PLATFORM_REVENUE via /admin/missions/fund) — no new
  // money source. guardNonNegative on PROMO means an unfunded pool fails the
  // settle instead of minting coins; the idempotency key makes retries safe.
  async settle(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.settledAt) throw new BadRequestException('Event already settled');
    if (event.prizePoolCoins <= 0) throw new BadRequestException('Event has no prize pool');
    if (Date.now() < event.endsAt.getTime()) throw new BadRequestException('Event has not ended yet');

    const { supporters } = await this.leaderboard(eventId, PRIZE_SHARES_BPS.length);
    const awards = supporters
      .map((s, i) => ({ userId: s.userId, rank: s.rank, coins: Math.floor((event.prizePoolCoins * PRIZE_SHARES_BPS[i]) / 10000) }))
      .filter((a) => a.coins > 0);

    if (!awards.length) {
      // No qualifying supporters: close the event, pool stays in PROMO.
      await this.prisma.event.update({ where: { id: eventId }, data: { settledAt: new Date() } });
      return { ok: true, winners: [], paidCoins: 0 };
    }

    const promo = await this.wallet.ensureSystemAccount(WalletAccountType.PROMO, 'COIN');
    const entries: { accountId: string; direction: LedgerDirection; amountMinor: number; currency: string }[] = [];
    for (const award of awards) {
      await this.wallet.ensureUserWallets(award.userId, 'COIN');
      const coin = await this.wallet.account(award.userId, WalletAccountType.COIN, 'COIN');
      entries.push({ accountId: coin.id, direction: LedgerDirection.CREDIT, amountMinor: award.coins, currency: 'COIN' });
    }
    const paidCoins = awards.reduce((sum, a) => sum + a.coins, 0);

    const tx = await this.ledger.postTransaction({
      type: LedgerTransactionType.EVENT_PRIZE,
      idempotencyKey: `event-prize:${eventId}`,
      metadata: { eventId, awards },
      entries: [{ accountId: promo.id, direction: LedgerDirection.DEBIT, amountMinor: paidCoins, currency: 'COIN' }, ...entries],
      guardNonNegative: [promo.id]
    });

    await this.prisma.event.update({ where: { id: eventId }, data: { settledAt: new Date() } });
    return { ok: true, winners: awards, paidCoins, ledgerTransactionId: tx.id };
  }
}
