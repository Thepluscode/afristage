import { AccountController } from './account.controller';

describe('AccountController', () => {
  function make() {
    const account = { selfDelete: jest.fn().mockResolvedValue({ ok: true }), export: jest.fn().mockResolvedValue({ report: 1 }) };
    return { c: new AccountController(account as any), account };
  }
  const u = { sub: 'u1' };

  it('self-delete passes the current user id and the confirmed password', () => {
    const { c, account } = make();
    c.delete(u, { password: 'pw' });
    expect(account.selfDelete).toHaveBeenCalledWith('u1', 'pw');
  });

  it('export scopes to the current user', () => {
    const { c, account } = make();
    c.export(u);
    expect(account.export).toHaveBeenCalledWith('u1');
  });
});
