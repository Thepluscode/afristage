import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }))
    }
  };
  const email: any = { send: jest.fn().mockResolvedValue(true) };
  return { service: new BetaService(prisma, email), prisma, email };
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

describe('BetaService.inviteFromRequest', () => {
  it('issues an invite for the request email and marks it INVITED', async () => {
    const { service, prisma } = build();
    prisma.betaRequest.findUnique.mockResolvedValue({ id: 'r1', email: 'ada@example.com', status: 'PENDING' });
    prisma.betaInvite.create.mockResolvedValue({ id: 'i9', email: 'ada@example.com', codeHash: 'h', type: 'CREATOR', status: 'PENDING', expiresAt: future });
    const res = await service.inviteFromRequest('admin1', 'r1');
    expect(typeof res.code).toBe('string');
    expect(prisma.betaInvite.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'ada@example.com', type: 'CREATOR' }) }));
    expect(prisma.betaRequest.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'INVITED' } });
  });

  it('throws when the request does not exist', async () => {
    const { service, prisma } = build();
    prisma.betaRequest.findUnique.mockResolvedValue(null);
    await expect(service.inviteFromRequest('admin1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to re-invite an already-invited request', async () => {
    const { service, prisma } = build();
    prisma.betaRequest.findUnique.mockResolvedValue({ id: 'r1', email: 'ada@example.com', status: 'INVITED' });
    await expect(service.inviteFromRequest('admin1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.betaInvite.create).not.toHaveBeenCalled();
  });
});

describe('BetaService admin listing', () => {
  it('listRequests filters by status when provided', async () => {
    const { service, prisma } = build();
    await service.listRequests('PENDING');
    expect(prisma.betaRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDING' } }));
  });

  it('listRequests omits the filter when no status is given', async () => {
    const { service, prisma } = build();
    await service.listRequests();
    expect(prisma.betaRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('list returns redacted invites (no codeHash leaks)', async () => {
    const { service, prisma } = build();
    prisma.betaInvite.findMany.mockResolvedValue([{ id: 'i1', email: 'a@b.c', codeHash: 'secret' }]);
    const res = await service.list();
    expect(res[0]).not.toHaveProperty('codeHash');
  });

  it('revoke marks an invite REVOKED and redacts it', async () => {
    const { service, prisma } = build();
    const res = await service.revoke('i1');
    expect(prisma.betaInvite.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'REVOKED' } }));
    expect(res).not.toHaveProperty('codeHash');
  });
});

describe('BetaService invite email delivery (best-effort)', () => {
  it('emails the one-time code to the invitee and still returns it to the admin', async () => {
    const { service, prisma, email } = build();
    prisma.betaInvite.create.mockResolvedValue({ id: 'i1', email: 'ada@example.com', codeHash: 'h', type: 'CREATOR', status: 'PENDING', expiresAt: new Date() });
    const res = await service.create('admin1', { email: 'ada@example.com', type: 'CREATOR' } as any);
    expect(res.code).toMatch(/^[0-9a-f]{32}$/);
    const [to, subject, body] = email.send.mock.calls[0];
    expect(to).toBe('ada@example.com');
    expect(subject).toContain('invite');
    expect(body).toContain(res.code);
  }, 20_000);

  it('skips email for phone-only invites', async () => {
    const { service, prisma, email } = build();
    prisma.betaInvite.create.mockResolvedValue({ id: 'i2', phone: '+2348000', codeHash: 'h', type: 'VIEWER', status: 'PENDING', expiresAt: new Date() });
    await service.create('admin1', { phone: '+2348000', type: 'VIEWER' } as any);
    expect(email.send).not.toHaveBeenCalled();
  }, 20_000);
});
