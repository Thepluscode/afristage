import { BadGatewayException, BadRequestException, ForbiddenException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { MetricsService } from '../metrics/metrics.service';
import { MoneyService } from '../money/money.service';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';

function build(opts: { configured?: boolean; intent?: any } = {}) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'fan@afristage.live' }) },
    paymentIntent: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'pi1', ...data })),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'pi1', ...data })),
      findUnique: jest.fn().mockResolvedValue(opts.intent),
      findFirst: jest.fn().mockResolvedValue(opts.intent)
    }
  };
  process.env.PAYSTACK_SECRET_KEY = opts.configured === false ? '' : 'sk_test_xyz';
  process.env.STRIPE_SECRET_KEY = opts.configured === false ? '' : 'sk_test_stripe';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const paystack = new PaystackProvider();
  const stripe = new StripeProvider();
  // creditCoins touches wallet + ledger; stub both so verify tests stay unit-scoped.
  const wallet: any = {
    ensureUserWallets: jest.fn(),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'sys' }),
    account: jest.fn().mockResolvedValue({ id: 'coin' })
  };
  const ledger: any = { postTransaction: jest.fn() };
  const service = new PaymentsService(prisma, new MoneyService(prisma, ledger, wallet, new MetricsService()), paystack, stripe);
  return { service, prisma, paystack, stripe, wallet, ledger };
}

const paystackIntent = {
  id: 'pi1',
  userId: 'owner-1',
  provider: 'paystack',
  status: 'PENDING',
  amountMinor: 500000,
  currency: 'NGN',
  coinAmount: 1000,
  providerReference: 'psk_ref'
};

function okVerify(amount = 500000, currency = 'NGN', status = 'success') {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: true, data: { status, amount, currency } })
  } as any);
}

// 'popular' package = 500000 minor NGN -> 550 coins (server-authoritative).
// provider:'card' → routed to Paystack by currency (NGN).
const dto = { packageId: 'popular', provider: 'card' as const };

afterEach(() => jest.restoreAllMocks());

describe('PaymentsService.createIntent (package pricing)', () => {
  it('rejects an unknown package id', async () => {
    const { service } = build();
    await expect(service.createIntent('u1', { packageId: 'free-million' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mock intent uses the server-side package price and coins, never client input', async () => {
    const { service, prisma } = build();
    await service.createIntent('u1', { packageId: 'popular' } as any);
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'mock', amountMinor: 500000, currency: 'NGN', coinAmount: 550 }) })
    );
  });
});

describe('PaymentsService.createIntent (paystack)', () => {
  it('records a PENDING intent and returns the checkout URL on success', async () => {
    const { service, prisma } = build();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc' } })
    } as any);

    const res: any = await service.createIntent('user-1234-5678', dto);

    expect(res.checkoutUrl).toBe('https://checkout.paystack.com/abc');
    expect(res.status).toBe('PENDING');
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'paystack', status: 'PENDING' }) })
    );
    // Persists the checkout URL (so a retry can resume it) but stays PENDING —
    // only the verified webhook/reconcile credits.
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pi1' }, data: expect.objectContaining({ checkoutUrl: 'https://checkout.paystack.com/abc' }) })
    );
    expect(prisma.paymentIntent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) })
    );
  });

  it('marks the intent FAILED when the provider rejects', async () => {
    const { service, prisma } = build();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ status: false, message: 'Invalid currency' })
    } as any);

    await expect(service.createIntent('user-1234-5678', dto)).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pi1' }, data: { status: 'FAILED' } })
    );
  });

  it('rejects when Paystack is not configured', async () => {
    const { service } = build({ configured: false });
    await expect(service.createIntent('u1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the user has no email', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ email: null });
    await expect(service.createIntent('u1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentsService.verifyCheckout (Paystack)', () => {
  it('credits coins once when Paystack reports success', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    okVerify();
    const res = await service.verifyCheckout('owner-1', 'pi1');
    expect(res).toEqual({ credited: true, status: 'succeeded' });
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not credit when the charge is still pending', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    okVerify(500000, 'NGN', 'ongoing');
    const res = await service.verifyCheckout('owner-1', 'pi1');
    expect(res.credited).toBe(false);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('is idempotent: an already-succeeded intent never re-credits', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent, status: 'SUCCEEDED' } });
    const fetchSpy = jest.spyOn(global, 'fetch');
    const res = await service.verifyCheckout('owner-1', 'pi1');
    expect(res).toEqual({ credited: false, status: 'already_credited' });
    expect(ledger.postTransaction).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled(); // short-circuits before calling Paystack
  });

  it('rejects an amount mismatch even if Paystack says success', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    okVerify(100, 'NGN', 'success');
    await expect(service.verifyCheckout('owner-1', 'pi1')).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('forbids verifying another user intent', async () => {
    const { service } = build({ intent: { ...paystackIntent } });
    await expect(service.verifyCheckout('someone-else', 'pi1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// Real HMAC-SHA512 over the raw body, exactly as Paystack signs webhooks.
function signed(body: object, secret = 'sk_test_xyz') {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  const signature = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  return { raw, signature };
}

const chargeSuccess = (over: any = {}) => ({
  event: 'charge.success',
  data: { reference: 'psk_ref', amount: 500000, currency: 'NGN', ...over }
});

describe('PaymentsService.handleWebhook (Paystack boundary)', () => {
  it('credits coins once for a valid signature with matching amount + currency', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed(chargeSuccess());
    const res = await service.handleWebhook('paystack',raw, signature);
    expect(res).toEqual({ received: true, matched: true });
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid signature before doing anything', async () => {
    const { service, ledger, prisma } = build({ intent: { ...paystackIntent } });
    const { raw } = signed(chargeSuccess());
    await expect(service.handleWebhook('paystack',raw, 'deadbeef')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.paymentIntent.findFirst).not.toHaveBeenCalled();
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('ignores non charge.success events', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed({ event: 'charge.failed', data: { reference: 'psk_ref' } });
    const res = await service.handleWebhook('paystack',raw, signature);
    expect(res.received).toBe(true);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('returns matched:false for an unknown reference (no credit)', async () => {
    const { service, ledger, prisma } = build({ intent: { ...paystackIntent } });
    prisma.paymentIntent.findFirst.mockResolvedValue(null);
    const { raw, signature } = signed(chargeSuccess());
    const res = await service.handleWebhook('paystack',raw, signature);
    expect(res).toEqual({ received: true, matched: false });
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects an amount mismatch before crediting', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed(chargeSuccess({ amount: 999 }));
    await expect(service.handleWebhook('paystack',raw, signature)).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects a currency mismatch before crediting', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed(chargeSuccess({ currency: 'GHS' }));
    await expect(service.handleWebhook('paystack',raw, signature)).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('a replayed webhook for an already-credited intent does not double-credit', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent, status: 'SUCCEEDED' } });
    const { raw, signature } = signed(chargeSuccess());
    const res = await service.handleWebhook('paystack',raw, signature);
    expect(res).toEqual({ received: true, matched: true });
    expect(ledger.postTransaction).not.toHaveBeenCalled(); // creditCoins short-circuits on SUCCEEDED
  });
});

const mockIntent = (over: any = {}) => ({
  id: 'pi1', userId: 'u1', provider: 'mock', status: 'PENDING',
  amountMinor: 100000, currency: 'NGN', coinAmount: 100, providerReference: 'mock_ref', ...over
});

describe('PaymentsService.completeMock (guards)', () => {
  it('is forbidden in production unless explicitly enabled', async () => {
    const { service } = build({ intent: mockIntent() });
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ENABLE_MOCK_PAYMENTS;
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_MOCK_PAYMENTS;
    try {
      await expect(service.completeMock('u1', 'pi1')).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevFlag === undefined) delete process.env.ENABLE_MOCK_PAYMENTS;
      else process.env.ENABLE_MOCK_PAYMENTS = prevFlag;
    }
  });

  it('throws NotFound for a missing intent', async () => {
    const { service } = build({ intent: undefined });
    await expect(service.completeMock('u1', 'gone')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids completing another user’s intent', async () => {
    const { service } = build({ intent: mockIntent({ userId: 'someone-else' }) });
    await expect(service.completeMock('u1', 'pi1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a non-mock intent', async () => {
    const { service } = build({ intent: mockIntent({ provider: 'paystack' }) });
    await expect(service.completeMock('u1', 'pi1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('credits coins on a valid mock completion', async () => {
    const { service, ledger } = build({ intent: mockIntent() });
    const res = await service.completeMock('u1', 'pi1');
    expect(ledger.postTransaction).toHaveBeenCalled();
    expect(res).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('rejects crediting an intent that is not PENDING (e.g. FAILED)', async () => {
    const { service } = build({ intent: mockIntent({ status: 'FAILED' }) });
    await expect(service.completeMock('u1', 'pi1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the intent unchanged when it is already SUCCEEDED', async () => {
    const { service, ledger } = build({ intent: mockIntent({ status: 'SUCCEEDED' }) });
    const res = await service.completeMock('u1', 'pi1');
    expect(res).toMatchObject({ status: 'SUCCEEDED' });
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.verifyCheckout (intent-type guard)', () => {
  it('rejects verifying a non-Paystack (mock) intent', async () => {
    const { service } = build({ intent: mockIntent({ provider: 'mock' }) });
    await expect(service.verifyCheckout('u1', 'pi1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentsService catalog + history', () => {
  it('listPackages returns the server-authoritative catalog', () => {
    const { service } = build();
    expect(Array.isArray(service.listPackages())).toBe(true);
    expect(service.listPackages().length).toBeGreaterThan(0);
  });

  it('mine lists a user’s payment intents newest-first', async () => {
    const { service, prisma } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([]);
    await service.mine('u1');
    expect(prisma.paymentIntent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
  });
});

describe('PaymentsService remaining branches', () => {
  it('creditCoins uses the intent id as external ref when providerReference is null', async () => {
    const { service, ledger } = build({ intent: mockIntent({ providerReference: null }) });
    await service.completeMock('u1', 'pi1');
    expect(ledger.postTransaction).toHaveBeenCalledWith(expect.objectContaining({ externalReference: 'pi1' }));
  });

  it('webhook rejects a charge.success event with no reference', async () => {
    const { service } = build();
    const { raw, signature } = signed({ event: 'charge.success', data: {} });
    await expect(service.handleWebhook('paystack',raw, signature)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('webhook treats a missing amount as -1 and rejects the mismatch', async () => {
    const { service } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed({ event: 'charge.success', data: { reference: 'psk_ref', currency: 'NGN' } });
    await expect(service.handleWebhook('paystack',raw, signature)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentsService final branch arms', () => {
  it('verifyCheckout uses the intent id when providerReference is null', async () => {
    const { service } = build({ intent: { ...paystackIntent, providerReference: null } });
    okVerify();
    const res = await service.verifyCheckout('owner-1', 'pi1');
    expect(res).toEqual({ credited: true, status: 'succeeded' });
  });

  it('verifyCheckout rejects a currency mismatch even when the amount matches', async () => {
    const { service } = build({ intent: { ...paystackIntent } });
    okVerify(500000, 'GHS', 'success'); // right amount, wrong currency
    await expect(service.verifyCheckout('owner-1', 'pi1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('webhook labels an event with no event field as unknown', async () => {
    const { service } = build();
    const { raw, signature } = signed({ data: {} }); // no `event` field
    expect(await service.handleWebhook('paystack',raw, signature)).toEqual({ received: true, ignored: true });
  });
});

describe('PaymentsService.verifyCheckout not-found', () => {
  it('throws NotFound when the intent does not exist', async () => {
    const { service } = build({ intent: undefined });
    await expect(service.verifyCheckout('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── Stripe path: global card-buying for non-African currencies (USD today). ──

// Stripe signs webhooks as t=<unix>,v1=<hmacSHA256(`${t}.${rawBody}`)>.
function stripeSigned(body: object, secret = 'whsec_test') {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  const t = String(Math.floor(Date.now() / 1000)); // fresh — within the replay window
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  return { raw, signature: `t=${t},v1=${v1}` };
}

const stripeCompleted = (over: any = {}) => ({
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_123', amount_total: 500, currency: 'usd', payment_status: 'paid', ...over } }
});

const stripeIntent = {
  id: 'pi2',
  userId: 'owner-1',
  provider: 'stripe',
  status: 'PENDING',
  amountMinor: 500,
  currency: 'USD',
  coinAmount: 550,
  providerReference: 'cs_test_123'
};

describe('PaymentsService currency routing (Stripe vs Paystack)', () => {
  it('routes a USD package to Stripe and persists the returned session id', async () => {
    const { service, prisma } = build();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_test_xyz', url: 'https://checkout.stripe.com/pay/cs_test_xyz' })
    } as any);

    const res: any = await service.createIntent('user-1234-5678', { packageId: 'popular_usd', provider: 'card' } as any);

    expect(res.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_xyz');
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'stripe', currency: 'USD', coinAmount: 550 }) })
    );
    // Stripe's session id differs from our reference, so the intent is updated to it.
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pi1' }, data: expect.objectContaining({ providerReference: 'cs_test_xyz' }) })
    );
  });

  it('rejects a USD package when Stripe is not configured', async () => {
    const { service } = build({ configured: false });
    await expect(service.createIntent('u1', { packageId: 'popular_usd', provider: 'card' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentsService.verifyCheckout (Stripe)', () => {
  it('credits coins once when Stripe reports the session paid', async () => {
    const { service, ledger } = build({ intent: { ...stripeIntent } });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_test_123', payment_status: 'paid', amount_total: 500, currency: 'usd' })
    } as any);
    const res = await service.verifyCheckout('owner-1', 'pi2');
    expect(res).toEqual({ credited: true, status: 'succeeded' });
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not credit when the Stripe session is unpaid', async () => {
    const { service, ledger } = build({ intent: { ...stripeIntent } });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_test_123', payment_status: 'unpaid', amount_total: 500, currency: 'usd' })
    } as any);
    const res = await service.verifyCheckout('owner-1', 'pi2');
    expect(res.credited).toBe(false);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.handleWebhook (Stripe boundary)', () => {
  it('credits coins for a valid Stripe signature with matching amount + currency', async () => {
    const { service, ledger } = build({ intent: { ...stripeIntent } });
    const { raw, signature } = stripeSigned(stripeCompleted());
    const res = await service.handleWebhook('stripe', raw, signature);
    expect(res).toEqual({ received: true, matched: true });
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid Stripe signature before doing anything', async () => {
    const { service, ledger, prisma } = build({ intent: { ...stripeIntent } });
    const { raw } = stripeSigned(stripeCompleted());
    await expect(service.handleWebhook('stripe', raw, 't=1700000000,v1=deadbeef')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.paymentIntent.findFirst).not.toHaveBeenCalled();
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('ignores non checkout.session.completed events', async () => {
    const { service, ledger } = build({ intent: { ...stripeIntent } });
    const { raw, signature } = stripeSigned({ type: 'payment_intent.created', data: { object: {} } });
    const res = await service.handleWebhook('stripe', raw, signature);
    expect(res.received).toBe(true);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects a Stripe amount mismatch before crediting', async () => {
    const { service, ledger } = build({ intent: { ...stripeIntent } });
    const { raw, signature } = stripeSigned(stripeCompleted({ amount_total: 999 }));
    await expect(service.handleWebhook('stripe', raw, signature)).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown payment provider name', async () => {
    const { service } = build();
    await expect(service.handleWebhook('venmo', Buffer.from('{}'), 'x')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentsService double-charge guard', () => {
  it('resumes an existing pending checkout instead of opening a second charge', async () => {
    const existing = { ...paystackIntent, id: 'piExisting', status: 'PENDING', checkoutUrl: 'https://checkout.paystack.com/existing' };
    const { service, prisma, paystack } = build({ intent: existing }); // findFirst returns existing
    const initSpy = jest.spyOn(paystack, 'initialize');
    const res: any = await service.createIntent('owner-1', dto);
    expect(res.id).toBe('piExisting');
    expect(res.checkoutUrl).toBe('https://checkout.paystack.com/existing');
    expect(initSpy).not.toHaveBeenCalled(); // no second provider checkout = no second charge
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled(); // no new intent
  });

  it('queries the dedupe window when no recent pending checkout exists', async () => {
    const { service, prisma } = build(); // findFirst → undefined
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/new' } })
    } as any);
    await service.createIntent('user-1234-5678', dto);
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING', checkoutUrl: { not: null } }) })
    );
    expect(prisma.paymentIntent.create).toHaveBeenCalled(); // proceeds to a fresh checkout
  });
});

describe('PaymentsService.reconcilePending (lost-webhook safety net)', () => {
  const stale = (over: any = {}) => ({ ...paystackIntent, status: 'PENDING', createdAt: new Date('2026-07-19T00:00:00Z'), ...over });
  const now = new Date('2026-07-19T00:10:00Z'); // 10 min after the sample intent

  it('credits a stale intent the provider confirms as paid', async () => {
    const { service, prisma, ledger } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([stale()]);
    okVerify(500000, 'NGN', 'success');
    const r = await service.reconcilePending(now);
    expect(r.credited).toBe(1);
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1); // credited exactly once
  });

  it('marks a long-abandoned unpaid intent FAILED so it stops being re-checked', async () => {
    const { service, prisma } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([stale({ id: 'piOld', createdAt: new Date('2026-07-01T00:00:00Z') })]);
    okVerify(500000, 'NGN', 'failed'); // provider: not paid
    const r = await service.reconcilePending(now);
    expect(r.failed).toBe(1);
    expect(prisma.paymentIntent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'piOld' }, data: { status: 'FAILED' } }));
  });

  it('leaves a recent still-unpaid intent alone (no credit, no fail)', async () => {
    const { service, prisma } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([stale()]); // 10 min old < 24h abandon cutoff
    okVerify(500000, 'NGN', 'failed');
    const r = await service.reconcilePending(now);
    expect(r).toEqual({ checked: 1, credited: 0, failed: 0 });
    expect(prisma.paymentIntent.update).not.toHaveBeenCalled();
  });

  it('scans only stale pending card intents (past the grace window)', async () => {
    const { service, prisma } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([]);
    await service.reconcilePending(now);
    expect(prisma.paymentIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING', provider: { in: ['paystack', 'stripe'] } }) })
    );
  });

  it('continues the sweep past an intent that throws', async () => {
    const { service, prisma } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([
      stale({ id: 'bad', provider: 'mock' }), // not a card provider → reconcileIntent throws
      stale({ id: 'good' }) // paystack → credited
    ]);
    okVerify(500000, 'NGN', 'success');
    const r = await service.reconcilePending(now);
    expect(r.checked).toBe(2);
    expect(r.credited).toBe(1); // the throw didn't abort the sweep
  });
});

describe('PaymentsService.scheduledReconcile', () => {
  it('logs when the sweep credited or failed something', async () => {
    const { service } = build();
    jest.spyOn(service, 'reconcilePending').mockResolvedValue({ checked: 3, credited: 2, failed: 1 });
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await service.scheduledReconcile();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('credited 2'));
    log.mockRestore();
  });

  it('stays quiet when nothing changed', async () => {
    const { service } = build();
    jest.spyOn(service, 'reconcilePending').mockResolvedValue({ checked: 0, credited: 0, failed: 0 });
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await service.scheduledReconcile();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('logs an error when the sweep throws', async () => {
    const { service } = build();
    jest.spyOn(service, 'reconcilePending').mockRejectedValue(new Error('db down'));
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    await service.scheduledReconcile();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('db down'));
    err.mockRestore();
  });
});

describe('PaymentsService reconcile — defensive branches', () => {
  it('defaults the clock to now when called with no argument', async () => {
    const { service, prisma } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([]);
    expect(await service.reconcilePending()).toEqual({ checked: 0, credited: 0, failed: 0 });
  });

  it('stringifies a non-Error thrown mid-sweep', async () => {
    const { service, prisma, paystack } = build();
    prisma.paymentIntent.findMany = jest.fn().mockResolvedValue([{ ...paystackIntent, status: 'PENDING', createdAt: new Date('2026-07-19T00:00:00Z') }]);
    jest.spyOn(paystack, 'verify').mockRejectedValue('provider exploded'); // non-Error
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const r = await service.reconcilePending(new Date('2026-07-19T00:10:00Z'));
    expect(r).toEqual({ checked: 1, credited: 0, failed: 0 });
    expect(err).toHaveBeenCalledWith(expect.stringContaining('provider exploded'));
    err.mockRestore();
  });

  it('stringifies a non-Error sweep failure in the cron', async () => {
    const { service } = build();
    jest.spyOn(service, 'reconcilePending').mockRejectedValue('boom');
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    await service.scheduledReconcile();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('boom'));
    err.mockRestore();
  });
});
