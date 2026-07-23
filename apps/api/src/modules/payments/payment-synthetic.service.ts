import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { MoneyService } from '../money/money.service';
import { WalletService } from '../wallet/wallet.service';
import { LedgerIntegrityService } from '../wallet/ledger-integrity.service';
import { findCoinPackage } from './coin-packages';
import { PaymentsService } from './payments.service';

// A PROACTIVE payment probe: on a schedule, run the real money loop end-to-end
// (mock purchase → credit coins → reverse) and assert coins landed and the ledger
// stayed balanced. The reactive revenue-drop alert (#185) only fires once REAL
// customers have started ≥3 checkouts and none settled — so in a quiet window,
// or the hour before a beta wave, a broken payment pipeline goes undetected. This
// closes that blind spot by exercising the path itself.
//
// Self-cleaning: each run credits then immediately CHARGEBACK-reverses the same
// intent, so the synthetic user's balance returns to baseline (net-zero) and the
// two balanced ledger txns keep integrity `ok`. The mock provider is excluded
// from the revenue-monitor counts, so a synthetic purchase never skews those.
//
// ponytail: no rollback-tx dry-run (coinPurchase manages its own tx + idempotency
// key, so it can't be wrapped) — reversing via the existing tested chargeback path
// is the clean way to leave zero net residue. Growth ceiling: 2 balanced ledger
// rows per run on ONE dedicated user; prune them if the table ever matters.
// ponytail: @Cron + scrapeable gauge (mirrors RevenueMonitorService) instead of a
// new endpoint — an on-demand pre-wave trigger can be added if ops wants one.

const SYNTHETIC_EMAIL = 'payment-synthetic@afristage.internal';
const SYNTHETIC_PACKAGE_ID = 'starter_usd'; // $1.00 → 100 coins (smallest global package)
const CURRENCY = 'COIN';

@Injectable()
export class PaymentSyntheticService {
  private readonly logger = new Logger(PaymentSyntheticService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly money: MoneyService,
    private readonly wallet: WalletService,
    private readonly integrity: LedgerIntegrityService,
    private readonly metrics: MetricsService
  ) {}

  // Off by default. Enable ONLY where the mock payment path works (staging):
  // completeMock is itself prod-gated, so an accidental prod enable is a no-op
  // failure, not a free-coin exploit.
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledProbe() {
    if (process.env.PAYMENT_SYNTHETIC_ENABLED !== 'true') return;
    try {
      await this.probe();
    } catch (e: any) {
      // A probe that throws IS a failed probe — record it so the gauge alarms,
      // and never let it take the app down.
      this.logger.error(`Payment synthetic threw: ${e?.message ?? e}`);
      this.metrics.recordPaymentSynthetic(false);
    }
  }

  // Runs the full mock money loop and returns the verdict. Sets the gauge as a
  // side effect (so both the cron and a direct call keep the metric truthful).
  async probe(): Promise<{ ok: boolean; creditedDelta: number; reversedToBaseline: boolean; integrityOk: boolean }> {
    const pkg = findCoinPackage(SYNTHETIC_PACKAGE_ID);
    if (!pkg) throw new Error(`synthetic package ${SYNTHETIC_PACKAGE_ID} missing from catalog`);

    const user = await this.ensureSyntheticUser();
    // A brand-new synthetic user has no wallet accounts until its first money
    // move creates them — reading balance first would throw "Missing COIN wallet".
    await this.wallet.ensureUserWallets(user.id, CURRENCY);
    const before = BigInt(await this.wallet.balance(user.id, WalletAccountType.COIN, CURRENCY));

    // Real path: create a mock PENDING intent, then credit it exactly as the
    // webhook / mock-complete flow does.
    const intent = await this.payments.createIntent(user.id, { packageId: pkg.id, provider: 'mock' });
    await this.payments.completeMock(user.id, intent.id);
    const afterCredit = BigInt(await this.wallet.balance(user.id, WalletAccountType.COIN, CURRENCY));
    const creditedDelta = Number(afterCredit - before);

    // Reverse via the same balanced chargeback path so the net effect is zero.
    await this.money.chargeback({
      userId: user.id,
      intentId: intent.id,
      coinAmount: pkg.coinAmount,
      provider: 'mock',
      providerReference: intent.providerReference ?? intent.id
    });
    const afterReverse = BigInt(await this.wallet.balance(user.id, WalletAccountType.COIN, CURRENCY));
    const reversedToBaseline = afterReverse === before;

    const integrity = await this.integrity.check();
    const ok = creditedDelta === pkg.coinAmount && reversedToBaseline && integrity.ok;

    this.metrics.recordPaymentSynthetic(ok);
    if (ok) {
      this.logger.log('Payment synthetic OK: mock purchase credited + reversed net-zero, ledger balanced');
    } else {
      this.logger.error(
        `Payment synthetic FAILED: creditedDelta=${creditedDelta} (expected ${pkg.coinAmount}), ` +
        `reversedToBaseline=${reversedToBaseline}, integrityOk=${integrity.ok} — the payment pipeline may be broken`
      );
    }
    return { ok, creditedDelta, reversedToBaseline, integrityOk: integrity.ok };
  }

  // One dedicated, deactivatable synthetic account (not a real user's wallet).
  private async ensureSyntheticUser(): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: SYNTHETIC_EMAIL } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: { email: SYNTHETIC_EMAIL, role: 'VIEWER', status: 'ACTIVE', ageConfirmed: true }
    });
  }
}
