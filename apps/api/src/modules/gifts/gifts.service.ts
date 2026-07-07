import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoomStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { AgenciesService } from '../agencies/agencies.service';
import { ChatGateway } from '../chat/chat.gateway';
import { FraudService } from '../fraud/fraud.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GiftSplitResult, MoneyService } from '../money/money.service';
import { SendGiftDto } from './dto/send-gift.dto';
import { CreateGiftDto } from './dto/create-gift.dto';
import { UpdateGiftDto } from './dto/update-gift.dto';

@Injectable()
export class GiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly money: MoneyService,
    private readonly chat: ChatGateway,
    private readonly notifications: NotificationsService,
    private readonly agg: AggregationService,
    private readonly fraud: FraudService,
    private readonly agencies: AgenciesService
  ) {}

  // Catalog: evergreen gifts plus event gifts whose window is currently open.
  list() {
    const now = new Date();
    return this.prisma.gift.findMany({
      where: {
        isActive: true,
        OR: [{ eventId: null }, { event: { startsAt: { lte: now }, endsAt: { gte: now } } }]
      },
      orderBy: { coinPrice: 'asc' }
    });
  }

  create(dto: CreateGiftDto) {
    return this.prisma.gift.create({ data: dto });
  }

  update(id: string, dto: UpdateGiftDto) {
    return this.prisma.gift.update({ where: { id }, data: dto });
  }

  // Top gifters in a room, ranked by total coins gifted. Pure aggregation over
  // GiftTransaction — powers the room's "top supporters" panel / battle scoring.
  async topGifters(roomId: string, limit = 10) {
    const take = Math.min(Math.max(Math.trunc(limit) || 10, 1), 50); // bounded: 1..50
    const rows = await this.agg.giftTotals({ by: 'viewerId', where: { roomId }, limit: take, sumQuantity: true });
    if (!rows.length) return [];

    const byId = await this.agg.profilesFor(rows.map((r) => r.key));
    return rows.map((r, i) => ({
      rank: i + 1,
      viewerId: r.key,
      displayName: byId.get(r.key)?.displayName ?? byId.get(r.key)?.username ?? 'Anonymous',
      totalCoins: r.totalCoins,
      giftCount: r.quantity
    }));
  }

  // A viewer's own gift-sending history (mirror of the creator's "gifts received").
  // GiftTransaction has no relation to the creator User, so resolve creator names
  // in a second query and expose only safe public fields.
  async myGifts(viewerId: string, limit = 50) {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100); // bounded: 1..100
    const txns = await this.prisma.giftTransaction.findMany({
      where: { viewerId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { gift: { select: { name: true, animationUrl: true } }, room: { select: { id: true, title: true } } }
    });
    if (!txns.length) return [];

    const creatorIds = [...new Set(txns.map((t) => t.creatorId))];
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: creatorIds } },
      select: { userId: true, displayName: true }
    });
    const byId = new Map(profiles.map((p) => [p.userId, p.displayName]));

    return txns.map((t) => ({
      id: t.id,
      giftName: t.gift.name,
      animationUrl: t.gift.animationUrl ?? null,
      quantity: t.quantity,
      totalCoinAmount: t.totalCoinAmount,
      roomId: t.roomId,
      roomTitle: t.room.title,
      creatorId: t.creatorId,
      creatorName: byId.get(t.creatorId) ?? 'Creator',
      createdAt: t.createdAt
    }));
  }

  // RFC #144 Layer B: send() is now a thin pipeline — validate the business
  // rules, settle the money through the catalog, project the domain row
  // idempotently, then run best-effort side effects only on a FRESH settle.
  async send(viewerId: string, roomId: string, dto: SendGiftDto) {
    const ctx = await this.validateSend(viewerId, roomId, dto);

    const move = await this.money.giftSplit({
      viewerId,
      creatorId: ctx.room.hostUserId,
      clientKey: dto.idempotencyKey,
      totalMinor: ctx.total,
      creatorShareBps: ctx.creatorShareBps,
      agency: ctx.agency,
      metadata: { roomId, viewerId, creatorId: ctx.room.hostUserId, giftId: ctx.gift.id, quantity: dto.quantity }
    });

    const { row, fresh } = await this.recordGiftTransaction(viewerId, roomId, dto, ctx, move);
    if (!fresh) return row; // idempotent replay: no re-broadcast, no re-notify

    await this.bestEffort(
      ['chat.broadcast', () => this.broadcastGift(roomId, viewerId, dto, ctx, move, row)],
      ['recognition', () => this.notifyIfTopSupporter(roomId, viewerId, ctx.room.title)]
    );
    // R5 §9 #4: keep the creator's fraud assessment warm off the money event
    // stream — async, coalesced, never blocks or fails the gift.
    this.fraud.queueReassess(ctx.room.hostUserId);
    return row;
  }

  // Every business rule that must hold BEFORE money moves: room live, no
  // self-gifting, active account, active gift, event window open at send time
  // (the catalog filter alone can't stop a stale client), agency lookup.
  private async validateSend(viewerId: string, roomId: string, dto: SendGiftDto) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== RoomStatus.LIVE) throw new BadRequestException('Room is not live');
    if (room.hostUserId === viewerId) throw new BadRequestException('You cannot gift yourself');

    const viewer = await this.prisma.user.findUnique({ where: { id: viewerId } });
    if (!viewer || viewer.status !== UserStatus.ACTIVE) throw new ForbiddenException('Account is not active');

    const gift = await this.prisma.gift.findUnique({ where: { id: dto.giftId }, include: { event: true } });
    if (!gift || !gift.isActive) throw new NotFoundException('Gift not found');
    if (gift.event) {
      const now = Date.now();
      if (now < gift.event.startsAt.getTime() || now > gift.event.endsAt.getTime()) {
        throw new BadRequestException('This gift is only available during its event');
      }
    }

    const agency = await this.agencies.commissionFor(room.hostUserId);
    return {
      room,
      gift,
      agency,
      total: gift.coinPrice * dto.quantity,
      creatorShareBps: Number(process.env.CREATOR_SHARE_BPS || 6000)
    };
  }

  // Idempotent projection: the domain row is keyed to the ledger transaction,
  // so a replayed settle finds the existing row and reports fresh=false.
  private async recordGiftTransaction(
    viewerId: string,
    roomId: string,
    dto: SendGiftDto,
    ctx: Awaited<ReturnType<GiftsService['validateSend']>>,
    move: GiftSplitResult
  ) {
    const existing = await this.prisma.giftTransaction.findFirst({ where: { ledgerTransactionId: move.transaction.id } });
    if (existing) return { row: existing, fresh: false };
    const row = await this.prisma.giftTransaction.create({
      data: {
        roomId,
        viewerId,
        creatorId: ctx.room.hostUserId,
        giftId: ctx.gift.id,
        ledgerTransactionId: move.transaction.id,
        quantity: dto.quantity,
        totalCoinAmount: move.totalMinor,
        creatorEarningMinor: move.creatorNetMinor, // post-commission: what the creator actually received
        platformFeeMinor: move.platformFeeMinor
      }
    });
    return { row, fresh: true };
  }

  // Live broadcast so everyone in the room sees the gift without refreshing.
  // ponytail: senderId only (no display-name lookup); enrich if the client needs it.
  private broadcastGift(
    roomId: string,
    viewerId: string,
    dto: SendGiftDto,
    ctx: Awaited<ReturnType<GiftsService['validateSend']>>,
    move: GiftSplitResult,
    row: { id: string; createdAt: Date }
  ) {
    this.chat.emitToRoom(roomId, 'gift.sent', {
      giftTransactionId: row.id,
      roomId,
      giftId: ctx.gift.id,
      giftName: ctx.gift.name,
      animationUrl: ctx.gift.animationUrl ?? null,
      senderId: viewerId,
      quantity: dto.quantity,
      totalCoinAmount: move.totalMinor,
      creatorEarningMinor: move.creatorNetMinor,
      platformFeeMinor: move.platformFeeMinor,
      createdAt: row.createdAt
    });
  }

  // GIFT_RECOGNITION (R4 taxonomy): tell the sender when this gift makes them
  // the room's top supporter. The per-room throttle in NotificationsService
  // caps this at one ping per room per window.
  private async notifyIfTopSupporter(roomId: string, viewerId: string, roomTitle: string) {
    const [top] = await this.topGifters(roomId, 1);
    if (top?.viewerId === viewerId) {
      await this.notifications.notifyUser(
        viewerId,
        'GIFT_RECOGNITION',
        'You are the top supporter!',
        `Your gifts made you the top supporter in "${roomTitle}".`,
        roomId
      );
    }
  }

  // Run named side effects after the money committed: each isolated and
  // logged, none can ever throw into the caller — the gift already succeeded.
  private async bestEffort(...effects: [string, () => void | Promise<unknown>][]) {
    for (const [name, run] of effects) {
      try {
        await run();
      } catch (e: any) {
        console.warn(`gift side effect '${name}' failed: ${e?.message ?? e}`);
      }
    }
  }
}
