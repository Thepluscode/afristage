import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { BetaService } from './beta.service';

function build() {
  const prisma: any = {
    betaInvite: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'i1', codeHash: 'h', ...data }))
    },
    betaRequest: {
      upsert: jest.fn().mockResolvedValue({ id: 'r1' }),
      findMany: jest.fn().mockResolvedValue([])
    }
  };
  return { service: new BetaService(prisma), prisma };
}

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 1000);

describe('BetaService.accept', () => {
  it('accepts a valid pending code once', async () => {
    const { service, prisma } = build();
    const code = 'abc123';
    prisma.betaInvite.findMany.mockResolvedValue([
      { id: 'i1', codeHash: await bcrypt.hash(code, 10), status: 'PENDING', expiresAt: future }
    ]);
    const res = await service.accept('user1', code);
    expect(prisma.betaInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1' }, data: expect.objectContaining({ status: 'ACCEPTED', acceptedById: 'user1' }) })
    );
    expect((res as any).codeHash).toBeUndefined(); // never leak the hash
  });

  it('rejects an expired code (and marks it EXPIRED)', async () => {
    const { service, prisma } = build();
    const code = 'expired1';
    prisma.betaInvite.findMany.mockResolvedValue([
      { id: 'i1', codeHash: await bcrypt.hash(code, 10), status: 'PENDING', expiresAt: past }
    ]);
    await expect(service.accept('u', code)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.betaInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } })
    );
  });

  it('rejects an unknown code (revoked/used invites are not in the PENDING set)', async () => {
    const { service, prisma } = build();
    prisma.betaInvite.findMany.mockResolvedValue([
      { id: 'i1', codeHash: await bcrypt.hash('the-real-code', 10), status: 'PENDING', expiresAt: future }
    ]);
    await expect(service.accept('u', 'wrong-code')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BetaService.requestInvite (public waitlist)', () => {
  it('captures a request and normalises the email', async () => {
    const { service, prisma } = build();
    const res = await service.requestInvite({ email: '  Ada@Example.COM ', displayName: 'Ada', category: 'MUSIC', country: 'NG' });
    expect(res).toEqual({ ok: true, status: 'received' });
    expect(prisma.betaRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'ada@example.com' },
        create: expect.objectContaining({ email: 'ada@example.com', displayName: 'Ada', category: 'MUSIC', country: 'NG' }),
        update: {}
      })
    );
  });

  it('is idempotent: a repeat email leaves the original request untouched (empty update)', async () => {
    const { service, prisma } = build();
    await service.requestInvite({ email: 'ada@example.com' });
    const call = prisma.betaRequest.upsert.mock.calls[0][0];
    expect(call.update).toEqual({}); // no overwrite of the existing row
  });
});
