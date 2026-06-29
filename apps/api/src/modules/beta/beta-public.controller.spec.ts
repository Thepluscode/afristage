import { BetaPublicController } from './beta-public.controller';
describe('BetaPublicController', () => {
  it('delegates request', () => {
    const s = { requestInvite: jest.fn() };
    new BetaPublicController(s as any).request({ email: 'x@y.z' } as any);
    expect(s.requestInvite).toHaveBeenCalled();
  });
});
