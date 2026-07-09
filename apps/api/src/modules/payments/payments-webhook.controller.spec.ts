import { PaymentsWebhookController } from './payments-webhook.controller';

describe('PaymentsWebhookController', () => {
  it('forwards the Paystack raw body + signature under the paystack provider', () => {
    const s = { handleWebhook: jest.fn() };
    const raw = Buffer.from('{}');
    new PaymentsWebhookController(s as any).paystack({ rawBody: raw } as any, 'sig');
    expect(s.handleWebhook).toHaveBeenCalledWith('paystack', raw, 'sig');
  });

  it('forwards the Stripe raw body + signature under the stripe provider', () => {
    const s = { handleWebhook: jest.fn() };
    const raw = Buffer.from('{}');
    new PaymentsWebhookController(s as any).stripe({ rawBody: raw } as any, 'sig');
    expect(s.handleWebhook).toHaveBeenCalledWith('stripe', raw, 'sig');
  });
});
