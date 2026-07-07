import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionType, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { LedgerKey, MoneyKey } from './money-keys';

// RFC #144 Layer A: the named catalog of every product money move. Each method
// owns the three things call sites used to get wrong by hand — its idempotency
// key convention, its guard role, and its split math. The private primitive
// underneath derives the debit from the sinks (unbalanced is unrepresentable)
// and derives guardNonNegative from the source's ROLE (an unguarded spend is
// unrepresentable). LedgerService.postTransaction stays reachable only for
// ADJUSTMENT/seed/manual-correction posts — never from feature services.

const CURRENCY = 'COIN';

// 'spend' — a balance that must never go negative (user COIN, EARNING, PROMO,
// PLATFORM_REVENUE). 'drain' — a hold/clearing counterparty that is allowed to
// pass through zero (PAYOUT_HOLD reversals, PAYMENT/PAYOUT_CLEARING). There is
// no third option, so the guard can never be forgotten or misapplied.
type Source = { kind: 'spend' | 'drain'; accountId: string };
type Sink = { accountId: string; amountMinor: number | bigint };

export interface MoveResult {
  transaction: Awaited<ReturnType<LedgerService['postTransaction']>>;
  replayed: boolean;
}

export interface GiftSplitResult extends MoveResult {
  totalMinor: number;
  creatorNetMinor: number;
  agencyCutMinor: number;
  platformFeeMinor: number;
}

// The share-of-x-in-basis-points math, in ONE place (was derived independently
// in gifts and events). floor() means remainders stay with the residual party.
export const bpsShare = (amount: number, bps: number) => Math.floor((amount * bps) / 10000);

@Injectable()
export class MoneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly metrics: MetricsService
  ) {}

  // ---------- the hot path ----------

  // The 3-or-4-leg gift split. Replay probe FIRST (a retried gift already paid —
  // it must short-circuit before the balance check would wrongly reject it),
  // then the friendly balance pre-check, then the guarded post. The row-locked
  // guard inside the ledger remains the actual overdraw protection.
  giftSplit(input: {
    viewerId: string;
    creatorId: string;
    clientKey: string;
    totalMinor: number;
    creatorShareBps: number;
    agency: { ownerUserId: string; agencyId: string; commissionBps: number } | null;
    metadata: Record<string, any>;
  }): Promise<GiftSplitResult> {
    return this.metrics.trackMove('giftSplit', () => input.totalMinor, () => this.giftSplitImpl(input));
  }

  private async giftSplitImpl(input: {
    viewerId: string;
    creatorId: string;
    clientKey: string;
    totalMinor: number;
    creatorShareBps: number;
    agency: { ownerUserId: string; agencyId: string; commissionBps: number } | null;
    metadata: Record<string, any>;
  }): Promise<GiftSplitResult> {
    const creatorShare = bpsShare(input.totalMinor, input.creatorShareBps);
    const agencyCut = input.agency ? bpsShare(creatorShare, input.agency.commissionBps) : 0;
    const creatorNet = creatorShare - agencyCut;
    const platformFee = input.totalMinor - creatorShare;
    const breakdown = {
      totalMinor: input.totalMinor,
      creatorNetMinor: creatorNet,
      agencyCutMinor: agencyCut,
      platformFeeMinor: platformFee
    };

    const key = MoneyKey.gift(input.viewerId, input.clientKey);
    const prior = await this.prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: key } });
    if (prior) return { transaction: prior as any, replayed: true, ...breakdown };

    const balance = BigInt(await this.wallet.balance(input.viewerId, WalletAccountType.COIN, CURRENCY));
    if (balance < BigInt(input.totalMinor)) throw new BadRequestException('Insufficient coin balance');

    const viewerCoin = await this.wallet.account(input.viewerId, WalletAccountType.COIN, CURRENCY);
    const creatorEarning = await this.wallet.account(input.creatorId, WalletAccountType.EARNING, CURRENCY);
    const platformRevenue = await this.wallet.ensureSystemAccount(WalletAccountType.PLATFORM_REVENUE, CURRENCY);
    const agencyEarning =
      input.agency && agencyCut > 0
        ? await this.wallet.ensureAccount(input.agency.ownerUserId, WalletAccountType.AGENCY_EARNING, CURRENCY)
        : null;

    const transaction = await this.postMove({
      type: LedgerTransactionType.GIFT,
      key,
      source: { kind: 'spend', accountId: viewerCoin.id },
      sinks: [
        { accountId: creatorEarning.id, amountMinor: creatorNet },
        ...(agencyEarning ? [{ accountId: agencyEarning.id, amountMinor: agencyCut }] : []),
        { accountId: platformRevenue.id, amountMinor: platformFee }
      ],
      metadata: {
        ...input.metadata,
        ...(agencyEarning ? { agencyId: input.agency!.agencyId, agencyCommissionMinor: agencyCut } : {})
      }
    });
    return { transaction, replayed: false, ...breakdown };
  }

  // ---------- the rarer moves ----------

  // PROMO -> user COIN. Unique per (user, mission, day); an unfunded promo pot
  // fails the claim, never mints.
  missionReward(input: { userId: string; missionKey: string; day: string; rewardCoins: number }): Promise<MoveResult> {
    return this.metrics.trackMove('missionReward', () => input.rewardCoins, () => this.missionRewardImpl(input));
  }

  private async missionRewardImpl(input: { userId: string; missionKey: string; day: string; rewardCoins: number }): Promise<MoveResult> {
    await this.wallet.ensureUserWallets(input.userId, CURRENCY);
    const promo = await this.wallet.ensureSystemAccount(WalletAccountType.PROMO, CURRENCY);
    const coin = await this.wallet.account(input.userId, WalletAccountType.COIN, CURRENCY);
    const transaction = await this.postMove({
      type: LedgerTransactionType.MISSION_REWARD,
      key: MoneyKey.missionReward(input.userId, input.missionKey, input.day),
      source: { kind: 'spend', accountId: promo.id },
      sinks: [{ accountId: coin.id, amountMinor: input.rewardCoins }],
      metadata: { userId: input.userId, missionKey: input.missionKey, day: input.day, rewardCoins: input.rewardCoins }
    });
    return { transaction, replayed: false };
  }

  // PLATFORM_REVENUE -> PROMO. The promo budget is moved, never minted.
  promoFund(input: { adminUserId: string; coins: number; nonce: number }): Promise<MoveResult> {
    return this.metrics.trackMove('promoFund', () => input.coins, () => this.promoFundImpl(input));
  }

  private async promoFundImpl(input: { adminUserId: string; coins: number; nonce: number }): Promise<MoveResult> {
    const revenue = await this.wallet.ensureSystemAccount(WalletAccountType.PLATFORM_REVENUE, CURRENCY);
    const promo = await this.wallet.ensureSystemAccount(WalletAccountType.PROMO, CURRENCY);
    const transaction = await this.postMove({
      type: LedgerTransactionType.PROMO_FUNDING,
      key: MoneyKey.promoFund(input.adminUserId, input.nonce),
      source: { kind: 'spend', accountId: revenue.id },
      sinks: [{ accountId: promo.id, amountMinor: input.coins }],
      metadata: { adminUserId: input.adminUserId, coins: input.coins }
    });
    return { transaction, replayed: false };
  }

  // PROMO -> N winners' COIN, one balanced fan-out. An underfunded pool fails
  // the settle; the debit is the sum of the awards by construction.
  prizeSettle(input: { eventId: string; awards: { userId: string; rank: number; coins: number }[] }): Promise<MoveResult> {
    return this.metrics.trackMove('prizeSettle', () => input.awards.reduce((s, a) => s + a.coins, 0), () => this.prizeSettleImpl(input));
  }

  private async prizeSettleImpl(input: { eventId: string; awards: { userId: string; rank: number; coins: number }[] }): Promise<MoveResult> {
    const promo = await this.wallet.ensureSystemAccount(WalletAccountType.PROMO, CURRENCY);
    const sinks: Sink[] = [];
    for (const award of input.awards) {
      await this.wallet.ensureUserWallets(award.userId, CURRENCY);
      const coin = await this.wallet.account(award.userId, WalletAccountType.COIN, CURRENCY);
      sinks.push({ accountId: coin.id, amountMinor: award.coins });
    }
    const transaction = await this.postMove({
      type: LedgerTransactionType.EVENT_PRIZE,
      key: MoneyKey.prizeSettle(input.eventId),
      source: { kind: 'spend', accountId: promo.id },
      sinks,
      metadata: { eventId: input.eventId, awards: input.awards }
    });
    return { transaction, replayed: false };
  }

  // EARNING -> PAYOUT_HOLD, guarded: two concurrent requests can't both reserve
  // the same earnings.
  payoutHold(input: {
    creatorUserId: string;
    requestKey: string;
    coinAmount: number | bigint;
    metadata: Record<string, any>;
  }): Promise<MoveResult> {
    return this.metrics.trackMove('payoutHold', () => Number(input.coinAmount), () => this.payoutHoldImpl(input));
  }

  private async payoutHoldImpl(input: {
    creatorUserId: string;
    requestKey: string;
    coinAmount: number | bigint;
    metadata: Record<string, any>;
  }): Promise<MoveResult> {
    const earning = await this.wallet.account(input.creatorUserId, WalletAccountType.EARNING, CURRENCY);
    const hold = await this.wallet.account(input.creatorUserId, WalletAccountType.PAYOUT_HOLD, CURRENCY);
    const transaction = await this.postMove({
      type: LedgerTransactionType.PAYOUT,
      key: MoneyKey.payoutHold(input.requestKey),
      source: { kind: 'spend', accountId: earning.id },
      sinks: [{ accountId: hold.id, amountMinor: input.coinAmount }],
      metadata: input.metadata
    });
    return { transaction, replayed: false };
  }

  // PAYOUT_HOLD -> EARNING. Draining a hold that already holds the funds —
  // structurally unguarded, so a reject can never be wrongly blocked.
  payoutReject(input: { payoutId: string; creatorUserId: string; coinAmount: number | bigint; reason?: string }): Promise<MoveResult> {
    return this.metrics.trackMove('payoutReject', () => Number(input.coinAmount), () => this.payoutRejectImpl(input));
  }

  private async payoutRejectImpl(input: { payoutId: string; creatorUserId: string; coinAmount: number | bigint; reason?: string }): Promise<MoveResult> {
    const hold = await this.wallet.account(input.creatorUserId, WalletAccountType.PAYOUT_HOLD, CURRENCY);
    const earning = await this.wallet.account(input.creatorUserId, WalletAccountType.EARNING, CURRENCY);
    const transaction = await this.postMove({
      type: LedgerTransactionType.PAYOUT,
      key: MoneyKey.payoutReject(input.payoutId),
      source: { kind: 'drain', accountId: hold.id },
      sinks: [{ accountId: earning.id, amountMinor: input.coinAmount }],
      metadata: { reason: input.reason }
    });
    return { transaction, replayed: false };
  }

  // PAYOUT_HOLD -> PAYOUT_CLEARING, recording the external transfer reference.
  payoutPaid(input: { payoutId: string; creatorUserId: string; coinAmount: number | bigint; providerReference?: string }): Promise<MoveResult> {
    return this.metrics.trackMove('payoutPaid', () => Number(input.coinAmount), () => this.payoutPaidImpl(input));
  }

  private async payoutPaidImpl(input: { payoutId: string; creatorUserId: string; coinAmount: number | bigint; providerReference?: string }): Promise<MoveResult> {
    const hold = await this.wallet.account(input.creatorUserId, WalletAccountType.PAYOUT_HOLD, CURRENCY);
    const clearing = await this.wallet.ensureSystemAccount(WalletAccountType.PAYOUT_CLEARING, CURRENCY);
    const transaction = await this.postMove({
      type: LedgerTransactionType.PAYOUT,
      key: MoneyKey.payoutPaid(input.payoutId),
      source: { kind: 'drain', accountId: hold.id },
      sinks: [{ accountId: clearing.id, amountMinor: input.coinAmount }],
      metadata: { payoutId: input.payoutId, providerReference: input.providerReference }
    });
    return { transaction, replayed: false };
  }

  // PAYMENT_CLEARING -> user COIN when a paid intent settles. Idempotent on the
  // intent, so a webhook replay is safe.
  coinPurchase(input: {
    userId: string;
    intentId: string;
    coinAmount: number | bigint;
    provider: string;
    amountMinor: string;
    fiatCurrency: string;
    externalReference: string;
  }): Promise<MoveResult> {
    return this.metrics.trackMove('coinPurchase', () => Number(input.coinAmount), () => this.coinPurchaseImpl(input));
  }

  private async coinPurchaseImpl(input: {
    userId: string;
    intentId: string;
    coinAmount: number | bigint;
    provider: string;
    amountMinor: string;
    fiatCurrency: string;
    externalReference: string;
  }): Promise<MoveResult> {
    await this.wallet.ensureUserWallets(input.userId, CURRENCY);
    const clearing = await this.wallet.ensureSystemAccount(WalletAccountType.PAYMENT_CLEARING, CURRENCY);
    const coin = await this.wallet.account(input.userId, WalletAccountType.COIN, CURRENCY);
    const transaction = await this.postMove({
      type: LedgerTransactionType.COIN_PURCHASE,
      key: MoneyKey.coinPurchase(input.intentId),
      source: { kind: 'drain', accountId: clearing.id },
      sinks: [{ accountId: coin.id, amountMinor: input.coinAmount }],
      externalReference: input.externalReference,
      metadata: { provider: input.provider, amountMinor: input.amountMinor, fiatCurrency: input.fiatCurrency }
    });
    return { transaction, replayed: false };
  }

  // ---------- the private primitive ----------

  // The one place a money move becomes ledger entries. The debit total is
  // DERIVED from the sinks (an unbalanced post cannot be built) and the guard
  // is DERIVED from the source role (an unguarded spend cannot be built).
  // Replay-before-balance ordering is inherited from postTransaction, which
  // probes the idempotency key before any balance work.
  private postMove(input: {
    type: LedgerTransactionType;
    key: LedgerKey;
    source: Source;
    sinks: Sink[];
    metadata?: Record<string, any>;
    externalReference?: string;
  }) {
    if (!input.sinks.length) throw new BadRequestException('A money move needs at least one sink');
    // Preserve the numeric type the caller used (bigint payout amounts stay
    // bigint; number gift legs stay number) so ledger rows and existing
    // assertions are byte-identical to the pre-refactor posts.
    const allBigint = input.sinks.every((s) => typeof s.amountMinor === 'bigint');
    const total = allBigint
      ? input.sinks.reduce((sum, s) => sum + (s.amountMinor as bigint), 0n)
      : input.sinks.reduce((sum, s) => sum + Number(s.amountMinor), 0);

    return this.ledger.postTransaction({
      type: input.type,
      idempotencyKey: input.key,
      ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
      metadata: input.metadata,
      entries: [
        { accountId: input.source.accountId, direction: LedgerDirection.DEBIT, amountMinor: total, currency: CURRENCY },
        ...input.sinks.map((s) => ({
          accountId: s.accountId,
          direction: LedgerDirection.CREDIT,
          amountMinor: s.amountMinor,
          currency: CURRENCY
        }))
      ],
      ...(input.source.kind === 'spend' ? { guardNonNegative: [input.source.accountId] } : {})
    });
  }
}
