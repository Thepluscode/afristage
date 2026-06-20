import { BadRequestException, Injectable } from '@nestjs/common';
import { BetaInvite, BetaInviteStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CreateBetaInviteDto } from './dto/create-beta-invite.dto';
import { RequestBetaInviteDto } from './dto/request-beta-invite.dto';

@Injectable()
export class BetaService {
  constructor(private readonly prisma: PrismaService) {}

  // Public waitlist capture from the landing page. Idempotent on email so a
  // double-submit (or a return visitor) never duplicates or errors — the caller
  // always gets the same neutral confirmation, which also avoids leaking whether
  // an email is already on the list.
  async requestInvite(dto: RequestBetaInviteDto) {
    const email = dto.email.trim().toLowerCase();
    await this.prisma.betaRequest.upsert({
      where: { email },
      create: { email, displayName: dto.displayName, category: dto.category, country: dto.country },
      update: {} // already on the list: leave the original request untouched
    });
    return { ok: true, status: 'received' as const };
  }

  // Admin review queue for the waitlist.
  listRequests(status?: string) {
    return this.prisma.betaRequest.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200
    });
  }

  // Codes are returned once in plaintext and stored only as a bcrypt hash.
  async create(invitedById: string, dto: CreateBetaInviteDto) {
    const code = crypto.randomBytes(16).toString('hex');
    const ttlDays = Number(process.env.BETA_INVITE_TTL_DAYS || 14);
    const invite = await this.prisma.betaInvite.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        type: dto.type,
        codeHash: await bcrypt.hash(code, 10),
        invitedById,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000)
      }
    });
    return { invite: this.redact(invite), code }; // code shown once
  }

  list() {
    return this.prisma.betaInvite.findMany({ orderBy: { createdAt: 'desc' } }).then((rows) => rows.map((r) => this.redact(r)));
  }

  async revoke(id: string) {
    return this.redact(
      await this.prisma.betaInvite.update({ where: { id }, data: { status: BetaInviteStatus.REVOKED } })
    );
  }

  // A code matches at most one PENDING invite; codes are hashed so we must scan + compare.
  async accept(acceptedById: string, code: string) {
    const candidates = await this.prisma.betaInvite.findMany({ where: { status: BetaInviteStatus.PENDING } });
    for (const invite of candidates) {
      if (!(await bcrypt.compare(code, invite.codeHash))) continue;
      if (invite.expiresAt < new Date()) {
        await this.prisma.betaInvite.update({ where: { id: invite.id }, data: { status: BetaInviteStatus.EXPIRED } });
        throw new BadRequestException('Invite has expired');
      }
      const accepted = await this.prisma.betaInvite.update({
        where: { id: invite.id },
        data: { status: BetaInviteStatus.ACCEPTED, acceptedById, acceptedAt: new Date() }
      });
      // A CREATOR invite grants the right to APPLY as creator — not automatic approval.
      return this.redact(accepted);
    }
    throw new BadRequestException('Invalid or already-used invite code');
  }

  private redact(invite: BetaInvite) {
    const { codeHash: _omit, ...rest } = invite;
    return rest;
  }
}
