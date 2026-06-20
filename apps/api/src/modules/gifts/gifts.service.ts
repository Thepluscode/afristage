import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionType, RoomStatus, UserStatus, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
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
    private readonly chat: ChatGateway
  ) {}

  list() {
    return this.prisma.gift.findMany({ where: { isActive: true }, orderBy: { coinPrice: 'asc' } });
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
    const rows = await this.prisma.giftTransaction.groupBy({
      by: ['viewerId'],
      where: { roomId },
      _sum: { totalCoinAmount: true, quantity: true },
      orderBy: { _sum: { totalCoinAmount: 'desc' } },
      take
    });
    if (!rows.length) return [];

    const viewerIds = rows.map((r) => r.viewerId);
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: viewerIds } },
      select: { userId: true, displayName: true, username: true }
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));

    return rows.map((r, i) => ({
      rank: i + 1,
      viewerId: r.viewerId,
      displayName: byId.get(r.viewerId)?.displayName ?? byId.get(r.viewerId)?.username ?? 'Anonymous',
      totalCoins: r._sum.totalCoinAmount ?? 0,
      giftCount: r._sum.quantity ?? 0
    }));
  }

  async send(viewerId: string, roomId: string, dto: SendGiftDto) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== RoomStatus.LIVE) throw new BadRequestException('Room is not live');
    if (room.hostUserId === viewerId) throw new BadRequestException('You cannot gift yourself');

    const viewer = await this.prisma.user.findUnique({ where: { id: viewerId } });
    if (!viewer || viewer.status !== UserStatus.ACTIVE) throw new ForbiddenException('Account is not active');

    const gift = await this.prisma.gift.findUnique({ where: { id: dto.giftId } });
    if (!gift || !gift.isActive) throw new NotFoundException('Gift not found');

    const total = gift.coinPrice * dto.quantity;
    const creatorShareBps = Number(process.env.CREATOR_SHARE_BPS || 6000);
    const creatorShare = Math.floor((total * creatorShareBps) / 10000);
    const platformFee = total - creatorShare;

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

    const tx = await this.ledger.postTransaction({
      type: LedgerTransactionType.GIFT,
      idempotencyKey,
      metadata: { roomId, viewerId, creatorId: room.hostUserId, giftId: gift.id, quantity: dto.quantity },
      entries: [
        { accountId: viewerCoin.id, direction: LedgerDirection.DEBIT, amountMinor: total, currency: 'COIN' },
        { accountId: creatorEarning.id, direction: LedgerDirection.CREDIT, amountMinor: creatorShare, currency: 'COIN' },
        { accountId: platformRevenue.id, direction: LedgerDirection.CREDIT, amountMinor: platformFee, currency: 'COIN' }
      ]
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
        creatorEarningMinor: creatorShare,
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
      senderId: viewerId,
      quantity: dto.quantity,
      totalCoinAmount: total,
      creatorEarningMinor: creatorShare,
      platformFeeMinor: platformFee,
      createdAt: giftTx.createdAt
    });
    return giftTx;
  }
}
