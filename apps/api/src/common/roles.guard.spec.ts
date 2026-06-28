import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

const ctx = (role?: string) => ({
  getHandler: () => undefined,
  getClass: () => undefined,
  switchToHttp: () => ({ getRequest: () => ({ user: { role } }) })
}) as any;

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const g = new RolesGuard({ getAllAndOverride: () => undefined } as any);
    expect(g.canActivate(ctx())).toBe(true);
  });

  it('allows when the user holds a required role', () => {
    const g = new RolesGuard({ getAllAndOverride: () => ['ADMIN'] } as any);
    expect(g.canActivate(ctx('ADMIN'))).toBe(true);
  });

  it('forbids when the user lacks every required role', () => {
    const g = new RolesGuard({ getAllAndOverride: () => ['ADMIN'] } as any);
    expect(() => g.canActivate(ctx('VIEWER'))).toThrow(ForbiddenException);
  });
});
