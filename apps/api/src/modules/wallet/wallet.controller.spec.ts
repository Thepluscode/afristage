import { WalletController } from './wallet.controller';
describe('WalletController', () => {
  it('delegates summary + history', () => {
    const s = { summary: jest.fn(), ledgerHistory: jest.fn() };
    const c = new WalletController(s as any);
    c.summary({ sub: 'u1' }); c.history({ sub: 'u1' });
    expect(s.summary).toHaveBeenCalledWith('u1'); expect(s.ledgerHistory).toHaveBeenCalledWith('u1');
  });
});
