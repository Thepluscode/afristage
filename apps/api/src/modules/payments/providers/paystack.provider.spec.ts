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
