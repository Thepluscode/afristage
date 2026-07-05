import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionType, RoomStatus, UserStatus, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { AgenciesService } from '../agencies/agencies.service';
import { ChatGateway } from '../chat/chat.gateway';
import { FraudService } from '../fraud/fraud.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { SendGiftDto } from './dto/send-gift.dto';
import { CreateGiftDto } from './dto/create-gift.dto';
import { UpdateGiftDto } from './dto/update-gift.dto';

@Injectable()
export class GiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly ledger: LedgerService,
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

  async send(viewerId: string, roomId: string, dto: SendGiftDto) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== RoomStatus.LIVE) throw new BadRequestException('Room is not live');
    if (room.hostUserId === viewerId) throw new BadRequestException('You cannot gift yourself');

    const viewer = await this.prisma.user.findUnique({ where: { id: viewerId } });
    if (!viewer || viewer.status !== UserStatus.ACTIVE) throw new ForbiddenException('Account is not active');

    const gift = await this.prisma.gift.findUnique({ where: { id: dto.giftId }, include: { event: true } });
    if (!gift || !gift.isActive) throw new NotFoundException('Gift not found');
    // Limited-time gift: enforce the window at SEND time too (the catalog
    // filter alone can't stop a stale client from buying after the event ends).
    if (gift.event) {
      const now = Date.now();
      if (now < gift.event.startsAt.getTime() || now > gift.event.endsAt.getTime()) {
        throw new BadRequestException('This gift is only available during its event');
      }
    }

    const total = gift.coinPrice * dto.quantity;
    const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 6000);
    const creatorShare = Math.floor((total * creatorShareBps) / 10000);
    const platformFee = total - creatorShare;
    // Agency commission (R4 §8): a managed creator's share is split with their
    // agency as an explicit fourth ledger leg — on-book, integrity-checked.
    // Suspended agencies and 0-bps configs return null (no leg).
    const agency = await this.agencies.commissionFor(room.hostUserId);
    const agencyCut = agency ? Math.floor((creatorShare * agency.commissionBps) / 10000) : 0;
    const creatorNet = creatorShare - agencyCut;

    // Scope the idempotency key to the viewer so one user's client key can never
    // collide with another's (which would otherwise return the wrong transaction).
    const idempotencyKey = `gift:${viewerId}:${dto.idempotencyKey}`;

    // Idempotent replay must short-circuit BEFORE the balance check: the original
    // gift already debited the coins, so a naive balance check would wrongly reject
    // a legitimate retry (e.g. client resend after a network blip).
    const priorTx = await this.prisma.ledgerTransaction.findUnique({ where: { idempotencyKey } });
    if (priorTx) {
      const prior = await this.prisma.giftTransaction.findFirst({ where: { ledgerTransactionId: priorTx.id } });
      if (prior) return prior;
    }

    const balance = BigInt(await this.wallet.balance(viewerId, WalletAccountType.COIN, 'COIN'));
    if (balance < BigInt(total)) throw new BadRequestException('Insufficient coin balance');

    const viewerCoin = await this.wallet.account(viewerId, WalletAccountType.COIN, 'COIN');
    const creatorEarning = await this.wallet.account(room.hostUserId, WalletAccountType.EARNING, 'COIN');
    const platformRevenue = await this.wallet.ensureSystemAccount(WalletAccountType.PLATFORM_REVENUE, 'COIN');
    const agencyEarning =
      agency && agencyCut > 0
        ? await this.wallet.ensureAccount(agency.ownerUserId, WalletAccountType.AGENCY_EARNING, 'COIN')
        : null;

    const tx = await this.ledger.postTransaction({
      type: LedgerTransactionType.GIFT,
      idempotencyKey,
      metadata: {
        roomId,
        viewerId,
        creatorId: room.hostUserId,
        giftId: gift.id,
        quantity: dto.quantity,
        ...(agencyEarning ? { agencyId: agency!.agencyId, agencyCommissionMinor: agencyCut } : {})
      },
      entries: [
        { accountId: viewerCoin.id, direction: LedgerDirection.DEBIT, amountMinor: total, currency: 'COIN' },
        { accountId: creatorEarning.id, direction: LedgerDirection.CREDIT, amountMinor: creatorNet, currency: 'COIN' },
        ...(agencyEarning
          ? [{ accountId: agencyEarning.id, direction: LedgerDirection.CREDIT, amountMinor: agencyCut, currency: 'COIN' }]
          : []),
        { accountId: platformRevenue.id, direction: LedgerDirection.CREDIT, amountMinor: platformFee, currency: 'COIN' }
      ],
      // Atomically re-check the viewer's coin balance under a row lock so two
      // concurrent gifts can't both pass the pre-check above and overdraw.
      guardNonNegative: [viewerCoin.id]
    });

    const existingGiftTx = await this.prisma.giftTransaction.findFirst({ where: { ledgerTransactionId: tx.id } });
    if (existingGiftTx) return existingGiftTx; // idempotent replay: don't re-broadcast

    const giftTx = await this.prisma.giftTransaction.create({
      data: {
        roomId,
        viewerId,
        creatorId: room.hostUserId,
        giftId: gift.id,
        ledgerTransactionId: tx.id,
        quantity: dto.quantity,
        totalCoinAmount: total,
        creatorEarningMinor: creatorNet, // post-commission: what the creator actually received
        platformFeeMinor: platformFee
      }
    });

    // Live broadcast so everyone in the room sees the gift without refreshing.
    // ponytail: senderId only (no display-name lookup); enrich if the client needs it.
    this.chat.emitToRoom(roomId, 'gift.sent', {
      giftTransactionId: giftTx.id,
      roomId,
      giftId: gift.id,
      giftName: gift.name,
      animationUrl: gift.animationUrl ?? null,
      senderId: viewerId,
      quantity: dto.quantity,
      totalCoinAmount: total,
      creatorEarningMinor: creatorNet,
      platformFeeMinor: platformFee,
      createdAt: giftTx.createdAt
    });

    // GIFT_RECOGNITION (R4 taxonomy): tell the sender when this gift makes them
    // the room's top supporter. Optional dependency — a notification failure
    // must never fail the gift, and the type's per-room throttle in
    // NotificationsService caps this at one ping per room per window.
    try {
      const [top] = await this.topGifters(roomId, 1);
      if (top?.viewerId === viewerId) {
        await this.notifications.notifyUser(
          viewerId,
          'GIFT_RECOGNITION',
          'You are the top supporter!',
          `Your gifts made you the top supporter in "${room.title}".`,
          roomId
        );
      }
    } catch {
      /* recognition is best-effort; the gift itself already succeeded */
    }
    // R5 §9 #4: keep the creator's fraud assessment warm off the money event
    // stream — async, coalesced, never blocks or fails the gift.
    this.fraud.queueReassess(room.hostUserId);
    return giftTx;
  }
}
