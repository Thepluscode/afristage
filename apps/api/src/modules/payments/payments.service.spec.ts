import { BadGatewayException, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './providers/paystack.provider';

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
  const paystack = new PaystackProvider();
  // creditCoins touches wallet + ledger; stub both so verify tests stay unit-scoped.
  const wallet: any = {
    ensureUserWallets: jest.fn(),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'sys' }),
    account: jest.fn().mockResolvedValue({ id: 'coin' })
  };
  const ledger: any = { postTransaction: jest.fn() };
  const service = new PaymentsService(prisma, wallet, ledger, paystack);
  return { service, prisma, paystack, wallet, ledger };
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
const dto = { packageId: 'popular', provider: 'paystack' as const };

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
  it('records a PENDING intent and returns the authorization URL on success', async () => {
    const { service, prisma } = build();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc', reference: 'psk_ref' } })
    } as any);

    const res: any = await service.createIntent('user-1234-5678', dto);

    expect(res.authorizationUrl).toBe('https://checkout.paystack.com/abc');
    expect(res.status).toBe('PENDING');
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'paystack', status: 'PENDING' }) })
    );
    // never auto-credits — only the verified webhook does that
    expect(prisma.paymentIntent.update).not.toHaveBeenCalled();
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

describe('PaymentsService.verifyPaystack', () => {
  it('credits coins once when Paystack reports success', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    okVerify();
    const res = await service.verifyPaystack('owner-1', 'pi1');
    expect(res).toEqual({ credited: true, status: 'succeeded' });
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not credit when the charge is still pending', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    okVerify(500000, 'NGN', 'ongoing');
    const res = await service.verifyPaystack('owner-1', 'pi1');
    expect(res.credited).toBe(false);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('is idempotent: an already-succeeded intent never re-credits', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent, status: 'SUCCEEDED' } });
    const fetchSpy = jest.spyOn(global, 'fetch');
    const res = await service.verifyPaystack('owner-1', 'pi1');
    expect(res).toEqual({ credited: false, status: 'already_credited' });
    expect(ledger.postTransaction).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled(); // short-circuits before calling Paystack
  });

  it('rejects an amount mismatch even if Paystack says success', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    okVerify(100, 'NGN', 'success');
    await expect(service.verifyPaystack('owner-1', 'pi1')).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('forbids verifying another user intent', async () => {
    const { service } = build({ intent: { ...paystackIntent } });
    await expect(service.verifyPaystack('someone-else', 'pi1')).rejects.toBeInstanceOf(ForbiddenException);
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

describe('PaymentsService.handlePaystackWebhook (boundary)', () => {
  it('credits coins once for a valid signature with matching amount + currency', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed(chargeSuccess());
    const res = await service.handlePaystackWebhook(raw, signature);
    expect(res).toEqual({ received: true, matched: true });
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid signature before doing anything', async () => {
    const { service, ledger, prisma } = build({ intent: { ...paystackIntent } });
    const { raw } = signed(chargeSuccess());
    await expect(service.handlePaystackWebhook(raw, 'deadbeef')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.paymentIntent.findFirst).not.toHaveBeenCalled();
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('ignores non charge.success events', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed({ event: 'charge.failed', data: { reference: 'psk_ref' } });
    const res = await service.handlePaystackWebhook(raw, signature);
    expect(res.received).toBe(true);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('returns matched:false for an unknown reference (no credit)', async () => {
    const { service, ledger, prisma } = build({ intent: { ...paystackIntent } });
    prisma.paymentIntent.findFirst.mockResolvedValue(null);
    const { raw, signature } = signed(chargeSuccess());
    const res = await service.handlePaystackWebhook(raw, signature);
    expect(res).toEqual({ received: true, matched: false });
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects an amount mismatch before crediting', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed(chargeSuccess({ amount: 999 }));
    await expect(service.handlePaystackWebhook(raw, signature)).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects a currency mismatch before crediting', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent } });
    const { raw, signature } = signed(chargeSuccess({ currency: 'GHS' }));
    await expect(service.handlePaystackWebhook(raw, signature)).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('a replayed webhook for an already-credited intent does not double-credit', async () => {
    const { service, ledger } = build({ intent: { ...paystackIntent, status: 'SUCCEEDED' } });
    const { raw, signature } = signed(chargeSuccess());
    const res = await service.handlePaystackWebhook(raw, signature);
    expect(res).toEqual({ received: true, matched: true });
    expect(ledger.postTransaction).not.toHaveBeenCalled(); // creditCoins short-circuits on SUCCEEDED
  });
});
