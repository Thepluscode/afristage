import { PaymentsController } from './payments.controller';
describe('PaymentsController', () => {
  it('delegates every endpoint', () => {
    const s = { listPackages: jest.fn(), createIntent: jest.fn(), completeMock: jest.fn(), verifyPaystack: jest.fn(), mine: jest.fn() };
    const c = new PaymentsController(s as any); const u = { sub: 'u1' };
    c.packages(); c.create(u, { packageId: 'p' } as any); c.completeMock(u, 'i1'); c.verifyPaystack(u, 'i1'); c.mine(u);
    expect(s.completeMock).toHaveBeenCalledWith('u1', 'i1'); expect(s.verifyPaystack).toHaveBeenCalledWith('u1', 'i1');
  });
});
