import { PaymentsWebhookController } from './payments-webhook.controller';
describe('PaymentsWebhookController', () => {
  it('forwards the raw body + signature', () => {
    const s = { handlePaystackWebhook: jest.fn() };
    const raw = Buffer.from('{}');
    new PaymentsWebhookController(s as any).paystack({ rawBody: raw } as any, 'sig');
    expect(s.handlePaystackWebhook).toHaveBeenCalledWith(raw, 'sig');
  });
});
