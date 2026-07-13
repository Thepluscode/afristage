import { AdminRecoveryController } from './admin-recovery.controller';

describe('AdminRecoveryController', () => {
  it('delegates password-reset-token and mfa-reset with the acting admin id', async () => {
    const s: any = {
      adminIssuePasswordResetToken: jest.fn().mockResolvedValue({ token: 't' }),
      adminResetMfa: jest.fn().mockResolvedValue({ recoveryCodes: [] })
    };
    const c = new AdminRecoveryController(s);
    await c.issuePasswordResetToken({ sub: 'admin1' }, 'u1');
    await c.resetMfa({ sub: 'admin1' }, 'u1');
    expect(s.adminIssuePasswordResetToken).toHaveBeenCalledWith('admin1', 'u1');
    expect(s.adminResetMfa).toHaveBeenCalledWith('admin1', 'u1');
  });
});
