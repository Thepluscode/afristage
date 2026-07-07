import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PayoutRequest, PayoutStatus, Prisma, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MoneyService } from '../money/money.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { RequestPayoutDto } from './dto/request-payout.dto';

// Allowed payout state transitions. Anything not listed (e.g. PAID -> REJECTED,
// PAID -> PAID, REQUESTED -> PAID) is rejected so weak systems can't lose money.
const ALLOWED_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  REQUESTED: [PayoutStatus.UNDER_REVIEW],
  UNDER_REVIEW: [PayoutStatus.APPROVED, PayoutStatus.REJECTED, PayoutStatus.HELD],
  APPROVED: [PayoutStatus.PROCESSING, PayoutStatus.PAID],
  PROCESSING: [PayoutStatus.PAID, PayoutStatus.FAILED],
  HELD: [PayoutStatus.UNDER_REVIEW],
  FAILED: [PayoutStatus.UNDER_REVIEW],
  REJECTED: [],
  PAID: []
};

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly money: MoneyService,
    private readonly notifications: NotificationsService
  ) {}

  private assertTransition(payout: PayoutRequest, to: PayoutStatus) {
    if (!ALLOWED_TRANSITIONS[payout.status].includes(to)) {
      throw new ConflictException(`Illegal payout transition ${payout.status} -> ${to}`);
    }
  }

  // Best-effort: a notification failure must never block or roll back a money
  // state change (optional dependency — Rule 9). Fire after the state is committed.
  private async notify(userId: string, title: string, body: string) {
    try {
      await this.notifications.notifyUser(userId, 'PAYOUT_UPDATE', title, body);
    } catch (e) {
      this.logger.warn(`payout notification failed for ${userId}: ${(e as Error).message}`);
    }
  }

  private audit(actorId: string, action: string, target: string, metadata: Record<string, any>) {
    return this.prisma.adminAuditLog.create({ data: { actorId, action, target, metadata } });
  }

  // --- Payout methods (where a creator's money settles) ---

  listMethods(userId: string) {
    return this.prisma.payoutMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
  }

  // The first method is forced default; an explicit isDefault demotes the others
  // so exactly one default exists at a time.
  async createMethod(userId: string, dto: CreatePayoutMethodDto) {
    const existing = await this.prisma.payoutMethod.count({ where: { userId } });
    const makeDefault = dto.isDefault === true || existing === 0;
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.payoutMethod.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.payoutMethod.create({
        data: {
          userId,
          provider: dto.provider,
          country: dto.country.toUpperCase(),
          currency: dto.currency.toUpperCase(),
          destinationReference: dto.destinationReference,
          label: dto.label,
          isDefault: makeDefault
        }
      });
    });
  }

  // Idempotent: deleteMany scoped to the owner so deleting a missing/foreign id
  // is a no-op, never another user's method.
  async deleteMethod(userId: string, id: string) {
    await this.prisma.payoutMethod.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  async request(creatorUserId: string, dto: RequestPayoutDto) {
    // Idempotency: a retried request with the same key returns the existing payout,
    // never moving funds to hold twice.
    const existing = await this.prisma.payoutRequest.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.creatorUserId !== creatorUserId) throw new ConflictException('Idempotency key already used');
      // Same key but a different amount is a client bug or an attack — never silently
      // return a payout for a different amount than was requested.
      if (existing.coinAmount !== BigInt(dto.coinAmount)) {
        throw new ConflictException('Idempotency key reused with a different amount');
      }
      return existing;
    }

    const minCoin = BigInt(process.env.MIN_PAYOUT_COIN || 500);
    if (BigInt(dto.coinAmount) < minCoin) throw new BadRequestException('Below minimum payout threshold');

    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: creatorUserId } });
    if (!creator?.payoutEnabled || creator.kycStatus !== 'APPROVED') throw new BadRequestException('Payout not enabled');

    const earningBalance = BigInt(await this.wallet.balance(creatorUserId, WalletAccountType.EARNING, 'COIN'));
    if (earningBalance < BigInt(dto.coinAmount)) throw new BadRequestException('Insufficient earnings');

    // A supplied payout method must belong to the requesting creator — never
    // settle to someone else's destination. Snapshot its destination so the
    // reviewer can disburse even if the method is later deleted.
    let destinationSnapshot: Prisma.PayoutRequestCreateInput | {} = {};
    if (dto.payoutMethodId) {
      const method = await this.prisma.payoutMethod.findFirst({ where: { id: dto.payoutMethodId, userId: creatorUserId } });
      if (!method) throw new BadRequestException('Invalid payout method');
      destinationSnapshot = {
        payoutProvider: method.provider,
        payoutDestinationLabel: method.label,
        payoutDestinationReference: method.destinationReference,
        payoutCountry: method.country
      };
    }

    // Explicit, snapshotted coin -> fiat conversion. Coins move on the ledger;
    // the fiat amount is recorded for the actual disbursement.
    const rate = Number(process.env.COIN_TO_FIAT_MINOR_RATE || 100); // fiat minor units per coin
    const fiatCurrency = process.env.CREATOR_PAYOUT_CURRENCY || 'NGN';
    const fiatMinor = BigInt(dto.coinAmount) * BigInt(rate);

    // Fraud hold: a new creator requesting a large payout is held for manual review
    // (funds still reserved in hold; admin must release HELD -> UNDER_REVIEW first).
    const newCreatorDays = Number(process.env.FRAUD_NEW_CREATOR_DAYS || 14);
    const largePayoutCoin = BigInt(process.env.FRAUD_LARGE_PAYOUT_COIN || 1_000_000);
    const creatorAgeDays = (Date.now() - creator.createdAt.getTime()) / 86_400_000;
    const flagged = creatorAgeDays < newCreatorDays && BigInt(dto.coinAmount) >= largePayoutCoin;
    const status = flagged ? PayoutStatus.HELD : PayoutStatus.UNDER_REVIEW;

    // 1. Create the payout record FIRST (REQUESTED) so funds are never moved to hold
    //    without a corresponding payout record (no orphan holds).
    let payout;
    try {
      payout = await this.prisma.payoutRequest.create({
        data: {
          creatorUserId,
          coinAmount: dto.coinAmount,
          fiatCurrency,
          fiatMinor,
          coinToFiatMinorRate: rate,
          idempotencyKey: dto.idempotencyKey,
          status: PayoutStatus.REQUESTED,
          payoutMethodId: dto.payoutMethodId,
          ...destinationSnapshot
        }
      });
    } catch (e) {
      // Concurrent request with the same key won the unique constraint.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.payoutRequest.findUniqueOrThrow({ where: { idempotencyKey: dto.idempotencyKey } });
      }
      throw e;
    }

    // 2. Move funds EARNING -> PAYOUT_HOLD (idempotent on the request key).
    // The money catalog guards EARNING under a row lock so two concurrent payout
    // requests can't both reserve the same earnings into withdrawable holds.
    const { transaction: holdTx } = await this.money.payoutHold({
      creatorUserId,
      requestKey: dto.idempotencyKey,
      coinAmount: dto.coinAmount,
      metadata: { creatorUserId, payoutMethodId: dto.payoutMethodId, fiatCurrency, fiatMinor: fiatMinor.toString(), rate }
    });

    // 3. Advance to UNDER_REVIEW (or HELD), recording the hold transaction.
    const updated = await this.prisma.payoutRequest.update({
      where: { id: payout.id },
      data: { status, holdLedgerTransactionId: holdTx.id }
    });
    if (flagged) {
      await this.audit(creatorUserId, 'payout.held', updated.id, {
        reason: 'new_creator_large_payout',
        creatorAgeDays: Math.floor(creatorAgeDays),
        coinAmount: dto.coinAmount
      });
    }
    return updated;
  }

  mine(creatorUserId: string) {
    return this.prisma.payoutRequest.findMany({ where: { creatorUserId }, orderBy: { createdAt: 'desc' } });
  }

  adminList(status?: string) {
    return this.prisma.payoutRequest.findMany({
      where: status ? { status: status as PayoutStatus } : {},
      orderBy: { createdAt: 'desc' },
      include: { creator: { include: { profile: true, creatorProfile: true } } }
    });
  }

  // Put an UNDER_REVIEW payout on hold for further investigation (funds stay in hold).
  async hold(reviewedBy: string, id: string, reason?: string) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    this.assertTransition(payout, PayoutStatus.HELD);
    const updated = await this.prisma.payoutRequest.update({ where: { id }, data: { status: PayoutStatus.HELD, reviewedBy, reviewedAt: new Date() } });
    await this.audit(reviewedBy, 'payout.held', id, { reason: reason ?? 'admin hold' });
    await this.notify(payout.creatorUserId, 'Payout on hold', `Your payout of ${payout.coinAmount} coins is on hold while we review it.`);
    return updated;
  }

  // Release a fraud hold back into the review queue (HELD -> UNDER_REVIEW).
  async release(reviewedBy: string, id: string) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    this.assertTransition(payout, PayoutStatus.UNDER_REVIEW);
    const updated = await this.prisma.payoutRequest.update({ where: { id }, data: { status: PayoutStatus.UNDER_REVIEW, reviewedBy, reviewedAt: new Date() } });
    await this.audit(reviewedBy, 'payout.released', id, {});
    return updated;
  }

  async approve(reviewedBy: string, id: string) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    this.assertTransition(payout, PayoutStatus.APPROVED);
    const updated = await this.prisma.payoutRequest.update({ where: { id }, data: { status: PayoutStatus.APPROVED, reviewedBy, reviewedAt: new Date() } });
    await this.audit(reviewedBy, 'payout.approved', id, { coinAmount: payout.coinAmount.toString() });
    await this.notify(payout.creatorUserId, 'Payout approved', `Your payout of ${payout.coinAmount} coins is approved and will be sent shortly.`);
    return updated;
  }

  async reject(reviewedBy: string, id: string, reason: string) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    this.assertTransition(payout, PayoutStatus.REJECTED);

    await this.money.payoutReject({ payoutId: id, creatorUserId: payout.creatorUserId, coinAmount: payout.coinAmount, reason });
    const updated = await this.prisma.payoutRequest.update({ where: { id }, data: { status: PayoutStatus.REJECTED, reviewedBy, reviewedAt: new Date(), rejectionReason: reason } });
    await this.audit(reviewedBy, 'payout.rejected', id, { coinAmount: payout.coinAmount.toString(), reason });
    await this.notify(payout.creatorUserId, 'Payout rejected', `Your payout of ${payout.coinAmount} coins was rejected: ${reason}. The coins are back in your earnings.`);
    return updated;
  }

  // providerReference is the external transfer id (bank/Paystack) — the proof a real
  // disbursement happened. Recorded so PAID is always reconcilable to a transfer.
  async markPaid(reviewedBy: string, id: string, providerReference?: string) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    this.assertTransition(payout, PayoutStatus.PAID); // blocks double-pay and REQUESTED/REJECTED -> PAID

    await this.money.payoutPaid({ payoutId: id, creatorUserId: payout.creatorUserId, coinAmount: payout.coinAmount, providerReference });
    const updated = await this.prisma.payoutRequest.update({
      where: { id },
      data: { status: PayoutStatus.PAID, reviewedBy, paidAt: new Date(), providerReference: providerReference?.trim() || null }
    });
    await this.audit(reviewedBy, 'payout.paid', id, { coinAmount: payout.coinAmount.toString(), providerReference: providerReference ?? null });
    const ref = providerReference?.trim();
    await this.notify(payout.creatorUserId, 'Payout sent', `Your payout of ${payout.coinAmount} coins has been sent.${ref ? ` Ref: ${ref}` : ''}`);
    return updated;
  }
}
