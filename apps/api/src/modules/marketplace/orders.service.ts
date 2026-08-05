import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, ProductStatus, RoomStatus, ShopStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MoneyKey } from '../money/money-keys';
import { MoneyService, PurchaseResult } from '../money/money.service';
import { PlaceOrderDto } from './dto/place-order.dto';

// The money side of the marketplace. Every rule that must hold before coins move
// is in validate(); the ordering below is what keeps two invariants true at once:
//
//   - a replayed submit charges once AND decrements stock once
//   - a failed charge never leaves stock reserved
//
// It gets there by probing for the replay before touching stock, reserving stock
// with a conditional update (so the last unit cannot be sold twice), and
// releasing that reservation if the charge then fails.

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly money: MoneyService
  ) {}

  async place(buyerId: string, dto: PlaceOrderDto) {
    // Replay FIRST: a retried submit must return the original order without
    // reserving a second unit of stock.
    const replayed = await this.findReplay(buyerId, dto.idempotencyKey);
    if (replayed) return replayed;

    const ctx = await this.validate(buyerId, dto);
    const total = ctx.product.priceCoins * dto.quantity;

    const reserved = await this.reserveStock(ctx.product.id, ctx.product.stock, dto.quantity);

    let move: PurchaseResult;
    try {
      move = await this.money.purchase({
        buyerId,
        sellerId: ctx.shop.ownerUserId,
        clientKey: dto.idempotencyKey,
        totalMinor: total,
        sellerShareBps: this.sellerShareBps(),
        metadata: {
          productId: ctx.product.id,
          shopId: ctx.shop.id,
          buyerId,
          sellerId: ctx.shop.ownerUserId,
          quantity: dto.quantity,
          ...(dto.roomId ? { roomId: dto.roomId } : {})
        }
      });
    } catch (error) {
      // The charge failed (insufficient balance, guard trip). Put the unit back
      // so a declined card does not silently consume inventory.
      if (reserved) await this.releaseStock(ctx.product.id, dto.quantity);
      throw error;
    }

    // The charge replayed, so an earlier attempt already reserved this unit —
    // it just died before writing the order row. Give back the reservation this
    // attempt took, or a crash between charge and projection would consume the
    // stock twice for one sale.
    if (reserved && move.replayed) await this.releaseStock(ctx.product.id, dto.quantity);

    return this.recordOrder(buyerId, dto, ctx, move, total);
  }

  // Idempotency lives on the ledger key, which MoneyService will mint from the
  // same inputs — so the probe and the charge can never disagree about what
  // counts as the same request.
  private async findReplay(buyerId: string, idempotencyKey: string) {
    const tx = await this.prisma.ledgerTransaction.findUnique({
      where: { idempotencyKey: MoneyKey.purchase(buyerId, idempotencyKey) }
    });
    if (!tx) return null;
    return this.prisma.order.findUnique({ where: { ledgerTransactionId: tx.id } });
  }

  // Every rule that must hold BEFORE coins move.
  private async validate(buyerId: string, dto: PlaceOrderDto) {
    const buyer = await this.prisma.user.findUnique({ where: { id: buyerId } });
    if (!buyer || buyer.status !== UserStatus.ACTIVE) throw new ForbiddenException('Account is not active');

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { shop: true }
    });
    if (!product || product.status !== ProductStatus.ACTIVE) throw new NotFoundException('Product not found');

    const shop = product.shop;
    if (shop.status !== ShopStatus.APPROVED) throw new NotFoundException('Product not found');
    if (shop.ownerUserId === buyerId) throw new BadRequestException('You cannot buy from your own shop');
    // A referral product is an advert, not inventory — there is nothing here to
    // charge for and no stock to move.
    if (product.externalUrl) throw new BadRequestException('This product is bought on the seller’s own site');

    // Room attribution has to be real: an unknown or non-live room would record
    // a sale against a stream that never showed the card.
    if (dto.roomId) {
      const room = await this.prisma.liveRoom.findUnique({ where: { id: dto.roomId } });
      if (!room) throw new NotFoundException('Room not found');
      if (room.status !== RoomStatus.LIVE) throw new BadRequestException('Room is not live');
    }

    return { product, shop };
  }

  // Conditional decrement: the `stock >= quantity` predicate and the decrement
  // are one statement, so two buyers racing for the last unit cannot both win.
  // A null stock means unlimited and reserves nothing.
  private async reserveStock(productId: string, stock: number | null, quantity: number) {
    if (stock === null) return false;
    const { count } = await this.prisma.product.updateMany({
      where: { id: productId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } }
    });
    if (count === 0) throw new BadRequestException('Not enough stock');
    return true;
  }

  private releaseStock(productId: string, quantity: number) {
    return this.prisma.product.updateMany({ where: { id: productId }, data: { stock: { increment: quantity } } });
  }

  // Idempotent projection, same shape as gifts: the domain row is keyed to the
  // ledger transaction, so a concurrent duplicate that got past the replay probe
  // still cannot mint a second order against one charge.
  private async recordOrder(
    buyerId: string,
    dto: PlaceOrderDto,
    ctx: Awaited<ReturnType<OrdersService['validate']>>,
    move: PurchaseResult,
    total: number
  ) {
    const existing = await this.prisma.order.findUnique({ where: { ledgerTransactionId: move.transaction.id } });
    if (existing) return existing;

    return this.prisma.order.create({
      data: {
        buyerUserId: buyerId,
        shopId: ctx.shop.id,
        productId: ctx.product.id,
        roomId: dto.roomId ?? null,
        quantity: dto.quantity,
        unitPriceCoins: ctx.product.priceCoins,
        totalCoins: total,
        sellerNetCoins: move.sellerNetMinor,
        platformFeeCoins: move.platformFeeMinor,
        ledgerTransactionId: move.transaction.id
      }
    });
  }

  // Share of a sale the seller keeps. Higher than the gift split (CREATOR_SHARE_BPS)
  // because the seller also sourced and ships the goods.
  private sellerShareBps() {
    const raw = Number(process.env.SELLER_SHARE_BPS || 9000);
    // A misconfigured env must not silently hand away 100% or charge 100%.
    return Number.isFinite(raw) && raw >= 0 && raw <= 10000 ? Math.trunc(raw) : 9000;
  }

  // ---------- reads ----------

  myOrders(buyerId: string, limit = 50) {
    return this.prisma.order.findMany({
      where: { buyerUserId: buyerId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limit) || 50, 1), 100),
      include: { product: { select: { title: true, imageUrl: true } }, shop: { select: { name: true, slug: true } } }
    });
  }

  async shopOrders(sellerId: string, limit = 50) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerUserId: sellerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    return this.prisma.order.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limit) || 50, 1), 100),
      include: { product: { select: { title: true } } }
    });
  }

  // The seller marks a sale shipped/handed over. Only forward, and only from
  // PLACED — re-fulfilling a cancelled order would erase why it was cancelled.
  async fulfil(sellerId: string, orderId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerUserId: sellerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.shopId !== shop.id) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PLACED) throw new BadRequestException(`Order is already ${order.status}`);

    return this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.FULFILLED } });
  }
}
