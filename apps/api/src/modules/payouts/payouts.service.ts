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

// Per-currency coin -> fiat minor-units rate. COIN_FIAT_RATES is a JSON map of
// currency -> minor units per coin (e.g. {"NGN":100,"USD":100,"GBP":80}); any
// currency not listed falls back to COIN_TO_FIAT_MINOR_RATE. These are a pricing
// decision — set them deliberately per payout currency.
export function coinFiatRate(currency: string): number {
  const fallback = Number(process.env.COIN_TO_FIAT_MINOR_RATE || 100);
  let table: Record<string, unknown>;
  try {
    table = JSON.parse(process.env.COIN_FIAT_RATES || '{}');
  } catch {
    return fallback;
  }
  const r = Number(table[currency]);
  return Number.isFinite(r) && r > 0 ? r : fallback;
}

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

  // Compare-and-set the status: the update only lands if the row is STILL in the
  // status we validated against, so of two reviewers acting on the same payout
  // exactly one wins and the other gets a 409 instead of silently overwriting.
  //
  // Why this matters: reading, validating and then writing left a window where
  // approve and reject could both pass assertTransition on the same UNDER_REVIEW
  // payout. Reject returned the coins to EARNING while approve won the write, so
  // the payout sat APPROVED over an empty hold — and markPaid then drained that
  // hold negative and paid a creator who had already been made whole.
  //
  // The claim is taken BEFORE the money move (it is the lock), and released if
  // the move fails so the payout is retryable rather than stranded mid-state.
  private async claim(
    id: string,
    to: PayoutStatus,
    data: Prisma.PayoutRequestUncheckedUpdateInput, // 'unchecked' = scalar FK fields (reviewedBy) writable directly
    move?: (payout: PayoutRequest) => Promise<unknown>
  ): Promise<{ before: PayoutRequest; after: PayoutRequest }> {
    const before = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Payout not found');
    this.assertTransition(before, to);

    let after: PayoutRequest;
    try {
      after = await this.prisma.payoutRequest.update({
        where: { id, status: before.status }, // <- the compare half of compare-and-set
        data: { ...data, status: to }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new ConflictException('Payout was changed by another reviewer — reload and retry');
      }
      throw e;
    }

    if (move) {
      try {
        await move(before);
      } catch (e) {
        // Release the claim so the payout is retryable — but never let a failure
        // in the release replace the real cause in the logs.
        try {
          await this.prisma.payoutRequest.updateMany({ where: { id, status: to }, data: { status: before.status } });
        } catch (releaseErr) {
          this.logger.error(`failed to release the ${to} claim on payout ${id}: ${(releaseErr as Error).message}`);
        }
        throw e;
      }
    }
    return { before, after };
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
    const method = dto.payoutMethodId
      ? await this.prisma.payoutMethod.findFirst({ where: { id: dto.payoutMethodId, userId: creatorUserId } })
      : null;
    if (dto.payoutMethodId && !method) throw new BadRequestException('Invalid payout method');
    const destinationSnapshot: Prisma.PayoutRequestCreateInput | {} = method
      ? {
          payoutProvider: method.provider,
          payoutDestinationLabel: method.label,
          payoutDestinationReference: method.destinationReference,
          payoutCountry: method.country
        }
      : {};

    // Explicit, snapshotted coin -> fiat conversion. Settle in the creator's own
    // currency (from the payout method; falls back to the platform default) at that
    // currency's published rate. Coins move on the ledger; fiat is the snapshot.
    const fiatCurrency = method?.currency ?? (process.env.CREATOR_PAYOUT_CURRENCY || 'NGN');
    const rate = coinFiatRate(fiatCurrency);
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
    const { before: payout, after: updated } = await this.claim(id, PayoutStatus.HELD, { reviewedBy, reviewedAt: new Date() });
    await this.audit(reviewedBy, 'payout.held', id, { reason: reason ?? 'admin hold' });
    await this.notify(payout.creatorUserId, 'Payout on hold', `Your payout of ${payout.coinAmount} coins is on hold while we review it.`);
    return updated;
  }

  // Release a fraud hold back into the review queue (HELD -> UNDER_REVIEW).
  async release(reviewedBy: string, id: string) {
    const { after: updated } = await this.claim(id, PayoutStatus.UNDER_REVIEW, { reviewedBy, reviewedAt: new Date() });
    await this.audit(reviewedBy, 'payout.released', id, {});
    return updated;
  }

  async approve(reviewedBy: string, id: string) {
    const { before: payout, after: updated } = await this.claim(id, PayoutStatus.APPROVED, { reviewedBy, reviewedAt: new Date() });
    await this.audit(reviewedBy, 'payout.approved', id, { coinAmount: payout.coinAmount.toString() });
    await this.notify(payout.creatorUserId, 'Payout approved', `Your payout of ${payout.coinAmount} coins is approved and will be sent shortly.`);
    return updated;
  }

  async reject(reviewedBy: string, id: string, reason: string) {
    // Claim REJECTED first, then return the held coins — a reviewer who lost the
    // race never moves money for a decision that didn't stick.
    // ponytail: REJECTED is terminal and has no in-flight state to park in, so a
    // process death between the claim and the reversal leaves the coins in the
    // hold, recoverable only by an ADJUSTMENT post. That is still the safer of
    // the two orderings — moving the money first would, on the same crash, return
    // the coins while the payout still read UNDER_REVIEW, letting the creator
    // request them a second time. Stuck beats duplicated. Give reject a
    // REJECTING state (as markPaid has PROCESSING) if this window ever bites.
    const { before: payout, after: updated } = await this.claim(
      id,
      PayoutStatus.REJECTED,
      { reviewedBy, reviewedAt: new Date(), rejectionReason: reason },
      (p) => this.money.payoutReject({ payoutId: id, creatorUserId: p.creatorUserId, coinAmount: p.coinAmount, reason })
    );
    await this.audit(reviewedBy, 'payout.rejected', id, { coinAmount: payout.coinAmount.toString(), reason });
    await this.notify(payout.creatorUserId, 'Payout rejected', `Your payout of ${payout.coinAmount} coins was rejected: ${reason}. The coins are back in your earnings.`);
    return updated;
  }

  // providerReference is the external transfer id (bank/Paystack) — the proof a real
  // disbursement happened. Recorded so PAID is always reconcilable to a transfer.
  // Disbursement is two-phase, because PAID is terminal. Claiming PAID up front
  // would block a second reviewer correctly but strand the payout if the process
  // died before the transfer posted: the row would read PAID with the coins still
  // in the hold, and no legal transition back out to retry from. So PROCESSING is
  // claimed first — that claim is what excludes the other reviewer — then the
  // transfer posts, then PROCESSING -> PAID. A crash leaves PROCESSING, which is
  // a legal state to resume from, and the ledger's idempotency key makes the
  // re-post a no-op. A transfer that merely fails also stays PROCESSING, which is
  // the honest description of an in-flight disbursement.
  async markPaid(reviewedBy: string, id: string, providerReference?: string) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');

    // Already PROCESSING means a previous attempt died mid-flight — resume it
    // rather than re-claiming, which APPROVED -> PROCESSING would reject.
    if (payout.status !== PayoutStatus.PROCESSING) {
      await this.claim(id, PayoutStatus.PROCESSING, { reviewedBy }); // blocks double-pay and REQUESTED/REJECTED -> PAID
    }

    await this.money.payoutPaid({ payoutId: id, creatorUserId: payout.creatorUserId, coinAmount: payout.coinAmount, providerReference });

    const { after: updated } = await this.claim(id, PayoutStatus.PAID, {
      reviewedBy,
      paidAt: new Date(),
      providerReference: providerReference?.trim() || null
    });
    await this.audit(reviewedBy, 'payout.paid', id, { coinAmount: payout.coinAmount.toString(), providerReference: providerReference ?? null });
    const ref = providerReference?.trim();
    await this.notify(payout.creatorUserId, 'Payout sent', `Your payout of ${payout.coinAmount} coins has been sent.${ref ? ` Ref: ${ref}` : ''}`);
    return updated;
  }
}
