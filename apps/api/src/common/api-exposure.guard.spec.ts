import { GLOBAL_USER_OMIT } from '../database/prisma.service';
import { PUBLIC_HOST_INCLUDE } from '../modules/live-rooms/public-host';
import { SupportersService } from '../modules/supporters/supporters.service';

// The API-exposure contract, enforced (see docs/api-exposure.md): no endpoint may
// leak credentials, and cross-user / public responses must carry only public
// profile fields — never email or phone. These tests fail the day a careless
// `include: { user: true }` or an `email: true` select slips into a shared shape.

const CREDENTIALS = ['passwordHash', 'mfaSecret', 'mfaRecoveryCodes', 'passwordResetTokenHash'];
const CROSS_USER_PII = ['email', 'phone'];

// Every key path in a nested object (select/include trees or response payloads).
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return [path, ...keyPaths(v, path)];
  });
}
const leaks = (obj: unknown, forbidden: string[]) =>
  keyPaths(obj).filter((p) => forbidden.includes(p.split('.').pop()!));

describe('API exposure guard', () => {
  it('globally omits every credential from user reads', () => {
    for (const field of CREDENTIALS) {
      expect((GLOBAL_USER_OMIT as Record<string, boolean>)[field]).toBe(true);
    }
  });

  it('PUBLIC_HOST_INCLUDE exposes a host via a whitelist select, never a raw relation', () => {
    // Must be a `select` (whitelist), not `host: true` (which would dump every field).
    expect((PUBLIC_HOST_INCLUDE as any).host.select).toBeDefined();
    // and that whitelist must never carry email/phone or credentials.
    expect(leaks(PUBLIC_HOST_INCLUDE, [...CROSS_USER_PII, ...CREDENTIALS])).toEqual([]);
  });

  it('the public display-name helper selects no email/phone', async () => {
    let captured: any;
    const prisma: any = { profile: { findMany: jest.fn((arg: any) => { captured = arg; return Promise.resolve([]); }) } };
    const svc: any = new (require('../modules/aggregation/aggregation.service').AggregationService)(prisma);
    await svc.profilesFor(['u1']);
    expect(leaks(captured.select, [...CROSS_USER_PII, ...CREDENTIALS])).toEqual([]);
  });

  it('a cross-user endpoint (supporter circle) returns no email/phone', async () => {
    const prisma: any = { creatorProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'c1' }) } };
    const agg: any = {
      giftTotals: jest.fn().mockResolvedValue([{ key: 'v1', totalCoins: 100000 }]),
      profilesFor: jest.fn().mockResolvedValue(new Map([['v1', { displayName: 'Zola', username: 'zola', avatarUrl: null }]]))
    };
    const out = await new SupportersService(prisma, agg).circle('c1');
    expect(leaks(out, [...CROSS_USER_PII, ...CREDENTIALS])).toEqual([]);
    expect(out.members[0]).toHaveProperty('displayName', 'Zola'); // public field IS present
  });
});
