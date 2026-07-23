import { Logger } from '@nestjs/common';
import { PaymentSyntheticService } from './payment-synthetic.service';
import * as catalog from './coin-packages';

// starter_usd → 100 coins is the package the probe uses.
const COINS = 100;

function build() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'syn-user' }),
      create: jest.fn().mockResolvedValue({ id: 'syn-user' })
    }
  };
  const payments: any = {
    createIntent: jest.fn().mockResolvedValue({ id: 'intent_1', providerReference: 'mock_ref_1' }),
    completeMock: jest.fn().mockResolvedValue(undefined)
  };
  const money: any = { chargeback: jest.fn().mockResolvedValue(undefined) };
  // balance is read 3×: before(0) → afterCredit(100) → afterReverse(0). Net-zero happy path.
  const wallet: any = {
    ensureUserWallets: jest.fn().mockResolvedValue(undefined),
    balance: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(COINS).mockResolvedValueOnce(0)
  };
  const integrity: any = { check: jest.fn().mockResolvedValue({ ok: true, unbalancedTransactions: 0, driftedAccounts: [] }) };
  const metrics: any = { recordPaymentSynthetic: jest.fn() };
  const svc = new PaymentSyntheticService(prisma, payments, money, wallet, integrity, metrics);
  return { svc, prisma, payments, money, wallet, integrity, metrics };
}

describe('PaymentSyntheticService.probe (money-loop proof)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('runs the full loop, verifies net-zero + balanced, sets gauge ok=1', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { svc, payments, money, integrity, metrics } = build();

    const r = await svc.probe();

    expect(r).toEqual({ ok: true, creditedDelta: COINS, reversedToBaseline: true, integrityOk: true });
    expect(payments.createIntent).toHaveBeenCalledWith('syn-user', { packageId: 'starter_usd', provider: 'mock' });
    expect(payments.completeMock).toHaveBeenCalledWith('syn-user', 'intent_1');
    expect(money.chargeback).toHaveBeenCalledWith({
      userId: 'syn-user', intentId: 'intent_1', coinAmount: COINS,
      provider: 'mock', providerReference: 'mock_ref_1'
    });
    expect(integrity.check).toHaveBeenCalled();
    expect(metrics.recordPaymentSynthetic).toHaveBeenCalledWith(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Payment synthetic OK'));
  });

  it('falls back to intent.id as the chargeback reference when providerReference is null', async () => {
    const { svc, payments, money } = build();
    payments.createIntent.mockResolvedValue({ id: 'intent_9', providerReference: null });
    await svc.probe();
    expect(money.chargeback).toHaveBeenCalledWith(expect.objectContaining({ providerReference: 'intent_9' }));
  });

  it('FAILS (gauge 0 + error) when coins credited != the package amount', async () => {
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc, wallet, metrics } = build();
    wallet.balance.mockReset();
    wallet.balance.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0); // credit did nothing
    const r = await svc.probe();
    expect(r.ok).toBe(false);
    expect(r.creditedDelta).toBe(0);
    expect(metrics.recordPaymentSynthetic).toHaveBeenCalledWith(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Payment synthetic FAILED'));
  });

  it('FAILS when the reversal did not return the balance to baseline', async () => {
    const { svc, wallet, metrics } = build();
    wallet.balance.mockReset();
    wallet.balance.mockResolvedValueOnce(0).mockResolvedValueOnce(COINS).mockResolvedValueOnce(COINS); // not reversed
    const r = await svc.probe();
    expect(r).toMatchObject({ ok: false, reversedToBaseline: false });
    expect(metrics.recordPaymentSynthetic).toHaveBeenCalledWith(false);
  });

  it('FAILS when the ledger integrity check is not ok', async () => {
    const { svc, integrity, metrics } = build();
    integrity.check.mockResolvedValue({ ok: false, unbalancedTransactions: 1, driftedAccounts: [] });
    const r = await svc.probe();
    expect(r).toMatchObject({ ok: false, integrityOk: false });
    expect(metrics.recordPaymentSynthetic).toHaveBeenCalledWith(false);
  });

  it('creates the synthetic user when it does not exist yet', async () => {
    const { svc, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await svc.probe();
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'payment-synthetic@afristage.internal', role: 'VIEWER', status: 'ACTIVE', ageConfirmed: true }
    });
  });

  it('throws if the configured synthetic package is missing from the catalog', async () => {
    const { svc } = build();
    jest.spyOn(catalog, 'findCoinPackage').mockReturnValue(undefined);
    await expect(svc.probe()).rejects.toThrow('missing from catalog');
  });
});

describe('PaymentSyntheticService.scheduledProbe (env-gated cron)', () => {
  const orig = process.env.PAYMENT_SYNTHETIC_ENABLED;
  afterEach(() => {
    if (orig === undefined) delete process.env.PAYMENT_SYNTHETIC_ENABLED;
    else process.env.PAYMENT_SYNTHETIC_ENABLED = orig;
    jest.restoreAllMocks();
  });

  it('is a no-op when PAYMENT_SYNTHETIC_ENABLED is not "true"', async () => {
    delete process.env.PAYMENT_SYNTHETIC_ENABLED;
    const { svc, payments } = build();
    await svc.scheduledProbe();
    expect(payments.createIntent).not.toHaveBeenCalled();
  });

  it('runs the probe when enabled', async () => {
    process.env.PAYMENT_SYNTHETIC_ENABLED = 'true';
    const { svc, payments } = build();
    await svc.scheduledProbe();
    expect(payments.createIntent).toHaveBeenCalled();
  });

  it('records a failed gauge and never throws when the probe blows up', async () => {
    process.env.PAYMENT_SYNTHETIC_ENABLED = 'true';
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc, payments, metrics } = build();
    payments.completeMock.mockRejectedValue(new Error('provider down'));
    await expect(svc.scheduledProbe()).resolves.toBeUndefined();
    expect(metrics.recordPaymentSynthetic).toHaveBeenCalledWith(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Payment synthetic threw'));
  });

  it('handles a non-Error throw (no .message) without crashing', async () => {
    process.env.PAYMENT_SYNTHETIC_ENABLED = 'true';
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc, payments, metrics } = build();
    payments.completeMock.mockRejectedValue('provider string error'); // no .message
    await expect(svc.scheduledProbe()).resolves.toBeUndefined();
    expect(metrics.recordPaymentSynthetic).toHaveBeenCalledWith(false);
  });
});
