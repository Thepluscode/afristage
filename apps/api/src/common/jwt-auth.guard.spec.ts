import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const ctx = (headers: any) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as any;

describe('JwtAuthGuard', () => {
  it('throws when the bearer header is missing', () => {
    const g = new JwtAuthGuard({ verify: jest.fn() } as any);
    expect(() => g.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('attaches req.user and allows a valid token', () => {
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'u1' }) };
    const req: any = { headers: { authorization: 'Bearer good' } };
    const c = { switchToHttp: () => ({ getRequest: () => req }) } as any;
    expect(new JwtAuthGuard(jwt as any).canActivate(c)).toBe(true);
    expect(req.user).toEqual({ sub: 'u1' });
  });

  it('throws on an invalid token', () => {
    const jwt = { verify: jest.fn(() => { throw new Error('bad'); }) };
    expect(() => new JwtAuthGuard(jwt as any).canActivate(ctx({ authorization: 'Bearer bad' }))).toThrow(UnauthorizedException);
  });
});
