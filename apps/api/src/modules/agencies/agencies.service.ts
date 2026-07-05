import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateAgencyDto } from './dto/create-agency.dto';
import { UpdateAgencyDto } from './dto/update-agency.dto';

// R4 §8: agencies are RELATIONSHIP (who manages whom) + one extra ledger leg
// (the commission split lives in gifts.service). This service is admin-only
// bookkeeping — it never moves money itself.
@Injectable()
export class AgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService
  ) {}

  async create(dto: CreateAgencyDto) {
    const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerUserId } });
    if (!owner) throw new BadRequestException('Owner user not found');
    const agency = await this.prisma.agency.create({
      data: { name: dto.name, ownerUserId: dto.ownerUserId, country: dto.country, commissionBps: dto.commissionBps ?? 1000 }
    });
    // The commission pot exists from day one so the first split never races.
    await this.wallet.ensureAccount(dto.ownerUserId, WalletAccountType.AGENCY_EARNING, 'COIN');
    return agency;
  }

  list() {
    return this.prisma.agency.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { creators: true } } }
    });
  }

  async detail(id: string) {
    const agency = await this.prisma.agency.findUnique({ where: { id }, include: { creators: true } });
    if (!agency) throw new NotFoundException('Agency not found');
    const [earnings, profiles] = await Promise.all([
      this.wallet
        .ensureAccount(agency.ownerUserId, WalletAccountType.AGENCY_EARNING, 'COIN')
        .then((a) => BigInt(a.balanceMinor).toString()),
      this.prisma.creatorProfile.findMany({
        where: { userId: { in: agency.creators.map((c) => c.creatorUserId) } },
        select: { userId: true, stageName: true, approvalStatus: true }
      })
    ]);
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return {
      ...agency,
      earningsCoins: earnings,
      creators: agency.creators.map((c) => ({
        creatorUserId: c.creatorUserId,
        stageName: byId.get(c.creatorUserId)?.stageName ?? null,
        approvalStatus: byId.get(c.creatorUserId)?.approvalStatus ?? null,
        addedAt: c.addedAt
      }))
    };
  }

  async update(id: string, dto: UpdateAgencyDto) {
    const agency = await this.prisma.agency.findUnique({ where: { id } });
    if (!agency) throw new NotFoundException('Agency not found');
    return this.prisma.agency.update({
      data: { commissionBps: dto.commissionBps, status: dto.status, country: dto.country },
      where: { id }
    });
  }

  // Assign a creator to an agency. One agency per creator (unique constraint);
  // the creator must have actually applied to be a creator.
  async addCreator(agencyId: string, creatorUserId: string) {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('Agency not found');
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: creatorUserId } });
    if (!creator) throw new BadRequestException('User has no creator profile');
    const existing = await this.prisma.agencyCreator.findUnique({ where: { creatorUserId } });
    if (existing) {
      if (existing.agencyId === agencyId) return { ok: true, alreadyManaged: true };
      throw new BadRequestException('Creator is already managed by another agency');
    }
    await this.prisma.agencyCreator.create({ data: { agencyId, creatorUserId } });
    return { ok: true, alreadyManaged: false };
  }

  async removeCreator(agencyId: string, creatorUserId: string) {
    const removed = await this.prisma.agencyCreator.deleteMany({ where: { agencyId, creatorUserId } });
    if (!removed.count) throw new NotFoundException('Creator is not managed by this agency');
    return { ok: true };
  }

  // The split gifts.service applies on a managed creator's gift. Returns null
  // for unmanaged creators, suspended agencies, or a zero commission — all of
  // which mean "no fourth leg".
  async commissionFor(creatorUserId: string) {
    const managed = await this.prisma.agencyCreator.findUnique({
      where: { creatorUserId },
      include: { agency: true }
    });
    if (!managed || managed.agency.status !== 'ACTIVE' || managed.agency.commissionBps <= 0) return null;
    return { agencyId: managed.agency.id, ownerUserId: managed.agency.ownerUserId, commissionBps: managed.agency.commissionBps };
  }
}
