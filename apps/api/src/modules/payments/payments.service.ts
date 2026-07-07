import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PaymentStatus, PaymentIntent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MoneyService } from '../money/money.service';
import { COIN_PACKAGES, CoinPackage, findCoinPackage } from './coin-packages';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaystackProvider } from './providers/paystack.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly money: MoneyService,
    private readonly paystack: PaystackProvider
  ) {}

  // Catalog of purchasable coin packages (server-authoritative pricing).
  listPackages() {
    return COIN_PACKAGES;
  }

  async createIntent(userId: string, dto: CreatePaymentIntentDto) {
    // Resolve the package server-side: the client picks an id, never the amounts.
    const pkg = findCoinPackage(dto.packageId);
    if (!pkg) throw new BadRequestException('Unknown coin package');
    if (dto.provider === 'paystack') return this.createPaystackIntent(userId, pkg);
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

  // Records a PENDING intent, then initializes a real Paystack checkout keyed to
  // the same reference. Coins are credited later, only by the verified webhook.
  // Returns the intent plus the hosted-checkout URL the client must open.
  private async createPaystackIntent(userId: string, pkg: CoinPackage) {
    if (!this.paystack.isConfigured()) throw new BadRequestException('Paystack is not configured');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new BadRequestException('A verified email is required for card payments');

    const reference = `psk_${userId.slice(0, 8)}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const intent = await this.prisma.paymentIntent.create({
      data: {
        userId,
        provider: 'paystack',
        amountMinor: pkg.amountMinor,
        currency: pkg.currency,
        coinAmount: pkg.coinAmount,
        status: PaymentStatus.PENDING,
        providerReference: reference
      }
    });

    try {
      const init = await this.paystack.initializeTransaction({
        email: user.email,
        amountMinor: pkg.amountMinor,
        currency: pkg.currency,
        reference
      });
      this.logger.log(`Paystack checkout initialized for intent ${intent.id} (ref ${reference})`);
      return { ...intent, authorizationUrl: init.authorizationUrl };
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
  async verifyPaystack(userId: string, intentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new NotFoundException('Payment intent not found');
    if (intent.userId !== userId) throw new ForbiddenException('Cannot verify another user payment intent');
    if (intent.provider !== 'paystack') throw new BadRequestException('Not a Paystack intent');
    if (intent.status === PaymentStatus.SUCCEEDED) return { credited: false, status: 'already_credited' as const };

    const v = await this.paystack.verifyTransaction(intent.providerReference || intentId);
    if (!v.success) return { credited: false, status: 'pending' as const };

    if (BigInt(v.amountMinor) !== BigInt(intent.amountMinor) || v.currency !== intent.currency) {
      this.logger.error(
        `Paystack verify amount/currency mismatch for ${intent.providerReference}: got ${v.amountMinor} ${v.currency}, expected ${intent.amountMinor} ${intent.currency}`
      );
      throw new BadRequestException('Amount or currency mismatch');
    }

    await this.creditCoins(intent);
    return { credited: true, status: 'succeeded' as const };
  }

  // Verified Paystack webhook. Never trusts the body until the HMAC matches, and
  // never credits unless the charged amount/currency match the recorded intent.
  async handlePaystackWebhook(rawBody: Buffer | undefined, signature?: string) {
    if (!this.paystack.verifySignature(rawBody, signature)) {
      this.logger.warn('Rejected Paystack webhook: invalid or missing signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const event = JSON.parse(rawBody!.toString('utf8'));
    if (event?.event !== 'charge.success') {
      return { received: true, ignored: event?.event ?? 'unknown' };
    }

    const reference = event?.data?.reference;
    if (!reference) throw new BadRequestException('Missing reference');

    const intent = await this.prisma.paymentIntent.findFirst({ where: { providerReference: reference } });
    if (!intent) {
      this.logger.warn(`Paystack webhook for unknown reference ${reference}`);
      return { received: true, matched: false };
    }

    // Doctrine: amount and currency must match the expected package before crediting.
    const paidMinor = BigInt(event.data.amount ?? -1);
    if (paidMinor !== BigInt(intent.amountMinor) || event.data.currency !== intent.currency) {
      this.logger.error(
        `Paystack amount/currency mismatch for ${reference}: paid ${paidMinor} ${event.data.currency}, expected ${intent.amountMinor} ${intent.currency}`
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
