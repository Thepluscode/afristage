import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentStatus, PaymentIntent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { MoneyService } from '../money/money.service';
import { COIN_PACKAGES, CoinPackage, findCoinPackage } from './coin-packages';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentProvider } from './providers/payment-provider';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';

// Currency → processor. African local corridors settle through Paystack; every
// other currency (USD today, more later) routes to Stripe. Adding a market is a
// package (coin-packages.ts) + an entry here.
const AFRICAN_CURRENCIES = new Set(['NGN', 'GHS', 'KES', 'ZAR']);

// A repeat buy for the same package within this window resumes the existing
// pending checkout instead of opening a second charge.
const DEDUPE_WINDOW_MIN = 10;
// The reconcile sweep leaves very-new intents alone (give the webhook a chance),
// and marks intents still unpaid after the abandon cutoff FAILED so they stop
// being re-checked (the hosted checkout has long expired).
const RECONCILE_GRACE_MIN = 2;
const ABANDON_AFTER_HOURS = 24;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  private readonly providers: Record<string, PaymentProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly money: MoneyService,
    private readonly paystack: PaystackProvider,
    private readonly stripe: StripeProvider,
    private readonly metrics: MetricsService
  ) {
    this.providers = { paystack, stripe };
  }

  // The processor a package's currency settles through.
  private providerForCurrency(currency: string): PaymentProvider {
    return AFRICAN_CURRENCIES.has(currency.toUpperCase()) ? this.paystack : this.stripe;
  }

  // Catalog of purchasable coin packages (server-authoritative pricing).
  listPackages() {
    return COIN_PACKAGES;
  }

  async createIntent(userId: string, dto: CreatePaymentIntentDto) {
    // Resolve the package server-side: the client picks an id, never the amounts.
    const pkg = findCoinPackage(dto.packageId);
    if (!pkg) throw new BadRequestException('Unknown coin package');
    if (dto.provider === 'card') return this.createCheckoutIntent(userId, pkg);
    return this.prisma.paymentIntent.create({
      data: {
        userId,
        provider: 'mock',
        amountMinor: pkg.amountMinor,
        currency: pkg.currency,
        coinAmount: pkg.coinAmount,
        status: PaymentStatus.PENDING,
        providerReference: `mock_${Date.now()}_${Math.random().toString(16).slice(2)}`
      }
    });
  }

  // Records a PENDING intent, then initializes a real hosted checkout with the
  // provider its currency routes to. Coins are credited later, only by the
  // verified webhook / pull-verify. Returns the intent plus the checkout URL.
  private async createCheckoutIntent(userId: string, pkg: CoinPackage) {
    const provider = this.providerForCurrency(pkg.currency);
    if (!provider.isConfigured()) throw new BadRequestException(`${provider.name} is not configured`);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new BadRequestException('A verified email is required for card payments');

    // Double-charge guard: a customer who hit a blank screen and retried resumes
    // the SAME pending checkout instead of opening a second charge.
    const dedupeSince = new Date(Date.now() - DEDUPE_WINDOW_MIN * 60_000);
    const existing = await this.prisma.paymentIntent.findFirst({
      where: {
        userId,
        provider: provider.name.toLowerCase(),
        coinAmount: pkg.coinAmount,
        currency: pkg.currency,
        status: PaymentStatus.PENDING,
        checkoutUrl: { not: null },
        createdAt: { gte: dedupeSince }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (existing) {
      this.logger.log(`Resuming pending checkout ${existing.id} for user ${userId} (no second charge)`);
      return { ...existing, checkoutUrl: existing.checkoutUrl! };
    }

    const reference = `${provider.name.toLowerCase()}_${userId.slice(0, 8)}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const intent = await this.prisma.paymentIntent.create({
      data: {
        userId,
        provider: provider.name.toLowerCase(),
        amountMinor: pkg.amountMinor,
        currency: pkg.currency,
        coinAmount: pkg.coinAmount,
        status: PaymentStatus.PENDING,
        providerReference: reference
      }
    });

    try {
      const init = await provider.initialize({
        email: user.email,
        amountMinor: pkg.amountMinor,
        currency: pkg.currency,
        reference
      });
      // Persist the checkout URL (so a retry can resume it) and, for Stripe,
      // its session id as the canonical reference the webhook + pull-verify use.
      const finalIntent = await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          checkoutUrl: init.checkoutUrl,
          ...(init.providerReference === reference ? {} : { providerReference: init.providerReference })
        }
      });
      this.logger.log(`${provider.name} checkout initialized for intent ${intent.id} (ref ${init.providerReference})`);
      // A customer just started paying — the business signal the revenue-drop
      // monitor compares against settled payments (checkouts up, payments 0 = alarm).
      this.metrics.checkoutIntents.inc();
      return { ...intent, ...finalIntent, checkoutUrl: init.checkoutUrl };
    } catch (err) {
      // Don't leave a stranded PENDING intent if the provider call fails.
      await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: PaymentStatus.FAILED } });
      throw err;
    }
  }

  // Single place that turns a paid intent into coins. Idempotent via the ledger
  // idempotency key, so a webhook replay or a mock double-complete is safe.
  private async creditCoins(intent: PaymentIntent) {
    if (intent.status === PaymentStatus.SUCCEEDED) return intent;
    if (intent.status !== PaymentStatus.PENDING) throw new BadRequestException('Payment intent is not pending');

    await this.money.coinPurchase({
      userId: intent.userId,
      intentId: intent.id,
      coinAmount: intent.coinAmount,
      provider: intent.provider,
      amountMinor: intent.amountMinor.toString(),
      fiatCurrency: intent.currency,
      externalReference: intent.providerReference || intent.id
    });

    this.logger.log(`Credited ${intent.coinAmount} coins to user ${intent.userId} (intent ${intent.id}, provider ${intent.provider})`);
    return this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: PaymentStatus.SUCCEEDED } });
  }

  async completeMock(userId: string, intentId: string) {
    // Free-coin exploit guard: mock completion is impossible in production unless
    // explicitly enabled (e.g. a staging environment that still wants it).
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_MOCK_PAYMENTS !== 'true') {
      throw new ForbiddenException('Mock payments are disabled');
    }
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new NotFoundException('Payment intent not found');
    if (intent.userId !== userId) throw new ForbiddenException('Cannot complete another user payment intent');
    if (intent.provider !== 'mock') throw new BadRequestException('Not a mock intent');
    return this.creditCoins(intent);
  }

  // Pull-based confirm: the client calls this after returning from checkout (or to
  // recover when a webhook never arrives in dev). Re-checks amount/currency against
  // the recorded intent, then credits via the same idempotent path as the webhook —
  // so verify + webhook (or a double-tap) can never double-credit.
  async verifyCheckout(userId: string, intentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new NotFoundException('Payment intent not found');
    if (intent.userId !== userId) throw new ForbiddenException('Cannot verify another user payment intent');
    return this.reconcileIntent(intent);
  }

  // Verify one intent against its provider and credit if genuinely paid. Shared
  // by the client pull-verify and the reconcile sweep — both converge on the
  // idempotent creditCoins, so webhook + verify + sweep can never double-credit.
  private async reconcileIntent(intent: PaymentIntent) {
    const provider = this.providers[intent.provider];
    if (!provider) throw new BadRequestException('Not a card intent');
    if (intent.status === PaymentStatus.SUCCEEDED) return { credited: false, status: 'already_credited' as const };

    const v = await provider.verify(intent.providerReference || intent.id);
    if (!v.success) return { credited: false, status: 'pending' as const };

    if (BigInt(v.amountMinor) !== BigInt(intent.amountMinor) || v.currency !== intent.currency) {
      this.logger.error(
        `${provider.name} verify amount/currency mismatch for ${intent.providerReference}: got ${v.amountMinor} ${v.currency}, expected ${intent.amountMinor} ${intent.currency}`
      );
      throw new BadRequestException('Amount or currency mismatch');
    }

    await this.creditCoins(intent);
    return { credited: true, status: 'succeeded' as const };
  }

  // Safety net for lost webhooks: a customer charged by the provider whose webhook
  // never arrived (and who never returned to pull-verify) would otherwise sit
  // PENDING forever — paid, no coins. This sweep verifies stale PENDING card
  // intents against the provider and credits any that actually paid; ones still
  // unpaid past the abandon cutoff are marked FAILED so they stop being re-checked.
  // ponytail: in-app @Cron over the installed scheduler; bounded batch.
  async reconcilePending(now = new Date()) {
    const grace = new Date(now.getTime() - RECONCILE_GRACE_MIN * 60_000);
    const abandonCutoff = new Date(now.getTime() - ABANDON_AFTER_HOURS * 3_600_000);
    const pending = await this.prisma.paymentIntent.findMany({
      where: {
        status: PaymentStatus.PENDING,
        provider: { in: Object.keys(this.providers) },
        createdAt: { lt: grace }
      },
      take: 200
    });
    let credited = 0;
    let failed = 0;
    for (const intent of pending) {
      try {
        const r = await this.reconcileIntent(intent);
        if (r.credited) {
          credited++;
        } else if (intent.createdAt < abandonCutoff) {
          await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: PaymentStatus.FAILED } });
          failed++;
        }
      } catch (e) {
        this.logger.error(`reconcile intent ${intent.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { checked: pending.length, credited, failed };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledReconcile() {
    try {
      const r = await this.reconcilePending();
      if (r.credited || r.failed) {
        this.logger.log(`payment reconcile: credited ${r.credited}, failed ${r.failed} of ${r.checked} stale pending`);
      }
    } catch (e) {
      this.logger.error(`payment reconcile sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Verified provider webhook. Never trusts the body until the provider's HMAC
  // matches, and never credits unless the charged amount/currency match the
  // recorded intent. `providerName` comes from the route ('paystack' | 'stripe').
  async handleWebhook(providerName: string, rawBody: Buffer | undefined, signature?: string) {
    const provider = this.providers[providerName];
    if (!provider) throw new BadRequestException('Unknown payment provider');
    if (!provider.verifySignature(rawBody, signature)) {
      this.logger.warn(`Rejected ${provider.name} webhook: invalid or missing signature`);
      throw new UnauthorizedException('Invalid signature');
    }

    const event = provider.parseWebhook(rawBody!);
    if (!event) return { received: true, ignored: true };
    if (event.kind === 'dispute') return this.handleDispute(provider, event.providerReference);
    if (!event.success) return { received: true, ignored: true };
    if (!event.providerReference) throw new BadRequestException('Missing reference');

    const intent = await this.prisma.paymentIntent.findFirst({ where: { providerReference: event.providerReference } });
    if (!intent) {
      this.logger.warn(`${provider.name} webhook for unknown reference ${event.providerReference}`);
      return { received: true, matched: false };
    }

    // Doctrine: amount and currency must match the expected package before crediting.
    if (BigInt(event.amountMinor) !== BigInt(intent.amountMinor) || event.currency !== intent.currency) {
      this.logger.error(
        `${provider.name} amount/currency mismatch for ${event.providerReference}: paid ${event.amountMinor} ${event.currency}, expected ${intent.amountMinor} ${intent.currency}`
      );
      throw new BadRequestException('Amount or currency mismatch');
    }

    await this.creditCoins(intent);
    return { received: true, matched: true };
  }

  // A dispute/chargeback fired. The dispute object references the charge or
  // payment-intent, which for Stripe is NOT the checkout-session id we stored —
  // so a match is best-effort. Matched: mark the intent DISPUTED and post the
  // CHARGEBACK ledger reversal (idempotent). Unmatched: we STILL log at ERROR
  // and increment the metric so a human reconciles it — never silently drop a
  // clawback (Rule 8). The response runbook is docs/dispute-response.md.
  private async handleDispute(provider: PaymentProvider, providerReference: string) {
    // providerReference is always non-empty here — parseWebhook returns null for a
    // reference-less dispute, so we never reach this with a blank reference.
    const key = provider.name.toLowerCase();
    const intent = await this.prisma.paymentIntent.findFirst({ where: { providerReference } });
    if (!intent) {
      this.logger.error(
        `${provider.name} DISPUTE for reference ${providerReference} — no matching intent (session-id vs dispute-id mismatch or stale). Reconcile manually: docs/dispute-response.md`
      );
      this.metrics.disputes.inc({ provider: key, outcome: 'unmatched' });
      return { received: true, dispute: true, matched: false };
    }

    const result = await this.money.chargeback({
      userId: intent.userId,
      intentId: intent.id,
      coinAmount: intent.coinAmount,
      provider: intent.provider,
      providerReference
    });
    await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: PaymentStatus.DISPUTED } });
    this.metrics.disputes.inc({ provider: key, outcome: result.replayed ? 'replayed' : 'reversed' });
    this.logger.error(
      `${provider.name} DISPUTE on intent ${intent.id} (user ${intent.userId}): reversed ${intent.coinAmount} coins${result.replayed ? ' (replay)' : ''}. Respond with evidence: docs/dispute-response.md`
    );
    return { received: true, dispute: true, matched: true, replayed: result.replayed };
  }

  mine(userId: string) {
    return this.prisma.paymentIntent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
