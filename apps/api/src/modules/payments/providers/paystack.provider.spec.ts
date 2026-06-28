import { BadGatewayException } from '@nestjs/common';
import { PaystackProvider } from './paystack.provider';

// Build a minimal fake fetch Response with a controllable status + body.
function res(status: number, body: any, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
    json: async () => body
  } as unknown as Response;
}

const OK_INIT = { status: true, data: { authorization_url: 'https://pay/x', reference: 'ref_1' } };

describe('PaystackProvider outbound retry', () => {
  let provider: PaystackProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy';
    provider = new PaystackProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('retries once on 429 then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(429, { status: false })).mockResolvedValueOnce(res(200, OK_INIT));
    const out = await provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'ref_1' });
    expect(out.authorizationUrl).toBe('https://pay/x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on transient 5xx then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(503, {})).mockResolvedValueOnce(res(200, OK_INIT));
    await provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'ref_1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps at MAX_ATTEMPTS (3) when 429 persists, then fails', async () => {
    fetchMock.mockResolvedValue(res(429, { status: false, message: 'rate limited' }));
    await expect(
      provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'ref_1' })
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a real 4xx rejection (400)', async () => {
    fetchMock.mockResolvedValue(res(400, { status: false, message: 'bad request' }));
    await expect(
      provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'ref_1' })
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on a network error then succeeds', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(res(200, OK_INIT));
    await provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'ref_1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('verifyTransaction also retries (429 then success)', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, { status: true, data: { status: 'success', amount: 5000, currency: 'NGN' } }));
    const v = await provider.verifyTransaction('ref_1');
    expect(v.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('PaystackProvider config + signature', () => {
  it('isConfigured is false for empty or placeholder secrets', () => {
    process.env.PAYSTACK_SECRET_KEY = '';
    expect(new PaystackProvider().isConfigured()).toBe(false);
    process.env.PAYSTACK_SECRET_KEY = 'replace_me';
    expect(new PaystackProvider().isConfigured()).toBe(false);
    process.env.PAYSTACK_SECRET_KEY = 'sk_live_real';
    expect(new PaystackProvider().isConfigured()).toBe(true);
  });

  it('verifySignature rejects missing inputs and bad signatures, accepts a real HMAC', () => {
    const crypto = require('crypto');
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy';
    const p = new PaystackProvider();
    const body = Buffer.from('{"event":"charge.success"}');
    expect(p.verifySignature(undefined, 'sig')).toBe(false);
    expect(p.verifySignature(body, undefined)).toBe(false);
    expect(p.verifySignature(body, 'deadbeef')).toBe(false); // length mismatch
    const good = crypto.createHmac('sha512', 'sk_test_dummy').update(body).digest('hex');
    expect(p.verifySignature(body, good)).toBe(true);
  });

  it('verifySignature returns false when the secret is unset', () => {
    process.env.PAYSTACK_SECRET_KEY = '';
    const p = new PaystackProvider();
    expect(p.verifySignature(Buffer.from('x'), 'sig')).toBe(false);
  });
});

describe('PaystackProvider error + backoff branches', () => {
  let provider: PaystackProvider;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy';
    process.env.PAYSTACK_BACKOFF_BASE_MS = '0'; // keep tests fast
    provider = new PaystackProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('honours a numeric Retry-After header then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, {}, '0')) // retry-after: 0s
      .mockResolvedValueOnce(res(200, OK_INIT));
    await provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'r' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws BadGateway when all attempts are network errors (init)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'r' })
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('verifyTransaction rejects a non-ok / bodyless verify response', async () => {
    fetchMock.mockResolvedValue(res(404, { status: false, message: 'not found' }));
    await expect(provider.verifyTransaction('ref')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('verifyTransaction throws BadGateway when all attempts are network errors', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(provider.verifyTransaction('ref')).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('PaystackProvider body-parse + timeout callbacks', () => {
  let provider: PaystackProvider;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy';
    process.env.PAYSTACK_BACKOFF_BASE_MS = '0';
    provider = new PaystackProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('treats an unparseable init body as empty and rejects', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, headers: { get: () => null }, json: async () => { throw new Error('bad json'); } });
    await expect(
      provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'r' })
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('treats an unparseable verify body as empty and rejects', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error('bad json'); } });
    await expect(provider.verifyTransaction('ref')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('uses params.reference when Paystack omits the echoed reference', async () => {
    fetchMock.mockResolvedValue(res(200, { status: true, data: { authorization_url: 'https://pay/x' } })); // no reference
    const out = await provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'mine' });
    expect(out.reference).toBe('mine');
  });

  it('coerces a missing verify amount to -1', async () => {
    fetchMock.mockResolvedValue(res(200, { status: true, data: { status: 'success', currency: 'NGN' } })); // no amount
    const v = await provider.verifyTransaction('ref');
    expect(v.amountMinor).toBe(-1);
  });

  it('stringifies a non-Error init rejection', async () => {
    fetchMock.mockRejectedValue('weird-string-failure'); // not an Error instance
    await expect(
      provider.initializeTransaction({ email: 'a@b.co', amountMinor: 5000, currency: 'NGN', reference: 'r' })
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('stringifies a non-Error verify rejection', async () => {
    fetchMock.mockRejectedValue('weird-string-failure');
    await expect(provider.verifyTransaction('ref')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
