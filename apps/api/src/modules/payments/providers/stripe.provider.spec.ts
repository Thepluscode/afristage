import { BadGatewayException } from '@nestjs/common';
import * as crypto from 'crypto';
import { StripeProvider } from './stripe.provider';

// Minimal fake fetch Response with a controllable status + body.
function res(status: number, body: any, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
    json: async () => body
  } as unknown as Response;
}

const OK_SESSION = { id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' };
const params = { email: 'a@b.co', amountMinor: 500, currency: 'USD', reference: 'stripe_ref_1' };

describe('StripeProvider outbound retry + initialize', () => {
  let provider: StripeProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_BACKOFF_BASE_MS = '0';
    provider = new StripeProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('creates a Checkout Session and returns url + session id as the reference', async () => {
    fetchMock.mockResolvedValue(res(200, OK_SESSION));
    const out = await provider.initialize(params);
    expect(out).toEqual({ checkoutUrl: OK_SESSION.url, providerReference: 'cs_test_1' });
    // form-encoded body carries our reference + lowercased currency + minor amount
    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain('client_reference_id=stripe_ref_1');
    expect(body).toContain('currency%5D=usd');
    expect(body).toContain('unit_amount%5D=500');
  });

  it('retries once on 429 then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(429, {})).mockResolvedValueOnce(res(200, OK_SESSION));
    await provider.initialize(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on transient 5xx then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(503, {})).mockResolvedValueOnce(res(200, OK_SESSION));
    await provider.initialize(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honours a numeric Retry-After header then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(429, {}, '0')).mockResolvedValueOnce(res(200, OK_SESSION));
    await provider.initialize(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps at 3 attempts when 429 persists, then fails', async () => {
    fetchMock.mockResolvedValue(res(429, { error: { message: 'rate limited' } }));
    await expect(provider.initialize(params)).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a real 4xx rejection (400)', async () => {
    fetchMock.mockResolvedValue(res(400, { error: { message: 'bad request' } }));
    await expect(provider.initialize(params)).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on a network error then succeeds', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(res(200, OK_SESSION));
    await provider.initialize(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws BadGateway when all attempts are network errors', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(provider.initialize(params)).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('treats an unparseable body as empty and rejects', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, headers: { get: () => null }, json: async () => { throw new Error('bad json'); } });
    await expect(provider.initialize(params)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('stringifies a non-Error rejection', async () => {
    fetchMock.mockRejectedValue('weird-string-failure');
    await expect(provider.initialize(params)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('StripeProvider.verify', () => {
  let provider: StripeProvider;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_BACKOFF_BASE_MS = '0';
    provider = new StripeProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('reports paid with amount + uppercased currency', async () => {
    fetchMock.mockResolvedValue(res(200, { id: 'cs_test_1', payment_status: 'paid', amount_total: 500, currency: 'usd' }));
    const v = await provider.verify('cs_test_1');
    expect(v).toEqual({ success: true, amountMinor: 500, currency: 'USD' });
  });

  it('reports not-paid for an unpaid session', async () => {
    fetchMock.mockResolvedValue(res(200, { id: 'cs_test_1', payment_status: 'unpaid', amount_total: 500, currency: 'usd' }));
    const v = await provider.verify('cs_test_1');
    expect(v.success).toBe(false);
  });

  it('coerces a missing amount to -1 and a missing currency to empty', async () => {
    fetchMock.mockResolvedValue(res(200, { id: 'cs_test_1', payment_status: 'paid' }));
    const v = await provider.verify('cs_test_1');
    expect(v.amountMinor).toBe(-1);
    expect(v.currency).toBe('');
  });

  it('rejects a non-ok / bodyless verify response', async () => {
    fetchMock.mockResolvedValue(res(404, { error: { message: 'no such session' } }));
    await expect(provider.verify('cs_test_1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('treats an unparseable verify body as empty and rejects', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error('bad json'); } });
    await expect(provider.verify('cs_test_1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws BadGateway when all attempts are network errors', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(provider.verify('cs_test_1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('stringifies a non-Error verify rejection', async () => {
    fetchMock.mockRejectedValue('weird-string-failure');
    await expect(provider.verify('cs_test_1')).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('StripeProvider config + signature', () => {
  it('isConfigured is false for empty or placeholder secrets', () => {
    process.env.STRIPE_SECRET_KEY = '';
    expect(new StripeProvider().isConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'replace_me';
    expect(new StripeProvider().isConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'sk_live_real';
    expect(new StripeProvider().isConfigured()).toBe(true);
  });

  function sign(raw: Buffer, t: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
  }

  it('verifySignature rejects missing inputs, malformed headers, and bad signatures; accepts a real HMAC', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    const p = new StripeProvider();
    const body = Buffer.from('{"type":"checkout.session.completed"}');
    expect(p.verifySignature(undefined, 't=1,v1=x')).toBe(false);
    expect(p.verifySignature(body, undefined)).toBe(false);
    expect(p.verifySignature(body, 'garbage')).toBe(false); // no t/v1
    expect(p.verifySignature(body, 't=1,v1=deadbeef')).toBe(false); // length mismatch
    const t = String(Math.floor(Date.now() / 1000)); // fresh timestamp
    const good = sign(body, t, 'whsec_dummy');
    expect(p.verifySignature(body, `t=${t},v1=${good}`)).toBe(true);
  });

  it('verifySignature rejects a replayed (stale) timestamp even with a valid HMAC', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    const p = new StripeProvider();
    const body = Buffer.from('{"type":"checkout.session.completed"}');
    const stale = String(Math.floor(Date.now() / 1000) - 3600); // 1h old, HMAC still valid
    const sig = sign(body, stale, 'whsec_dummy');
    expect(p.verifySignature(body, `t=${stale},v1=${sig}`)).toBe(false);
  });

  it('verifySignature rejects a non-numeric timestamp', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    const p = new StripeProvider();
    const body = Buffer.from('{"type":"checkout.session.completed"}');
    const sig = sign(body, 'abc', 'whsec_dummy'); // HMAC over "abc.body" matches, but t is NaN
    expect(p.verifySignature(body, `t=abc,v1=${sig}`)).toBe(false);
  });

  it('verifySignature returns false when the webhook secret is unset', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    const p = new StripeProvider();
    expect(p.verifySignature(Buffer.from('x'), 't=1,v1=x')).toBe(false);
  });
});

describe('StripeProvider.parseWebhook', () => {
  const p = () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    return new StripeProvider();
  };

  it('returns null for an unparseable body', () => {
    expect(p().parseWebhook(Buffer.from('not json'))).toBeNull();
  });

  it('returns null for a non checkout.session.completed event', () => {
    expect(p().parseWebhook(Buffer.from(JSON.stringify({ type: 'payment_intent.created', data: { object: {} } })))).toBeNull();
  });

  it('extracts session id/amount/currency (uppercased) and paid state', () => {
    const raw = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', amount_total: 500, currency: 'usd', payment_status: 'paid' } } }));
    expect(p().parseWebhook(raw)).toEqual({ providerReference: 'cs_1', amountMinor: 500, currency: 'USD', success: true });
  });

  it('marks success false for an unpaid completed session and defaults missing fields', () => {
    const raw = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: {} }));
    expect(p().parseWebhook(raw)).toEqual({ providerReference: '', amountMinor: -1, currency: '', success: false });
  });
});
