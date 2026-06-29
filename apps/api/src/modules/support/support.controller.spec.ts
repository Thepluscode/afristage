import { SupportController } from './support.controller';
describe('SupportController', () => {
  it('delegates every endpoint', () => {
    const s = { createTicket: jest.fn(), myTickets: jest.fn(), getTicket: jest.fn(), addMessage: jest.fn(), adminList: jest.fn(), assign: jest.fn(), resolve: jest.fn() };
    const c = new SupportController(s as any); const u = { sub: 'u1', role: 'ADMIN' };
    c.create(u, { subject: 's' } as any); c.mine(u); c.get(u, 't1'); c.addMessage(u, 't1', { message: 'm', internal: false } as any);
    c.adminList(); c.assign(u, 't1'); c.resolve('t1'); c.adminMessage(u, 't1', { message: 'note', internal: true } as any);
    expect(s.getTicket).toHaveBeenCalledWith('u1', 'ADMIN', 't1');
    expect(s.addMessage).toHaveBeenNthCalledWith(1, 'u1', 'ADMIN', 't1', 'm', false);
    expect(s.addMessage).toHaveBeenNthCalledWith(2, 'u1', 'ADMIN', 't1', 'note', true);
  });
});
