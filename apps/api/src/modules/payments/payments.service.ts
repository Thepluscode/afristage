import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PaymentStatus, PaymentIntent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
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

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  private readonly providers: Record<string, PaymentProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly money: MoneyService,
    private readonly paystack: PaystackProvider,
    private readonly stripe: StripeProvider
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
      // Stripe returns its session id as the canonical reference; persist it so
      // the webhook + pull-verify find this intent. Paystack echoes our own ref.
      const finalIntent =
        init.providerReference === reference
          ? intent
          : await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { providerReference: init.providerReference } });
      this.logger.log(`${provider.name} checkout initialized for intent ${intent.id} (ref ${init.providerReference})`);
      return { ...finalIntent, checkoutUrl: init.checkoutUrl };
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
    const provider = this.providers[intent.provider];
    if (!provider) throw new BadRequestException('Not a card intent');
    if (intent.status === PaymentStatus.SUCCEEDED) return { credited: false, status: 'already_credited' as const };

    const v = await provider.verify(intent.providerReference || intentId);
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

    const charge = provider.parseWebhook(rawBody!);
    if (!charge || !charge.success) {
      return { received: true, ignored: true };
    }
    if (!charge.providerReference) throw new BadRequestException('Missing reference');

    const intent = await this.prisma.paymentIntent.findFirst({ where: { providerReference: charge.providerReference } });
    if (!intent) {
      this.logger.warn(`${provider.name} webhook for unknown reference ${charge.providerReference}`);
      return { received: true, matched: false };
    }

    // Doctrine: amount and currency must match the expected package before crediting.
    if (BigInt(charge.amountMinor) !== BigInt(intent.amountMinor) || charge.currency !== intent.currency) {
      this.logger.error(
        `${provider.name} amount/currency mismatch for ${charge.providerReference}: paid ${charge.amountMinor} ${charge.currency}, expected ${intent.amountMinor} ${intent.currency}`
      );
      throw new BadRequestException('Amount or currency mismatch');
    }

    await this.creditCoins(intent);
    return { received: true, matched: true };
  }

  mine(userId: string) {
    return this.prisma.paymentIntent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
