import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [users, creators, rooms, gifts] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.creatorProfile.count(),
      this.prisma.liveRoom.count(),
      this.prisma.giftTransaction.aggregate({ _sum: { totalCoinAmount: true }, _count: true })
    ]);
    return { users, creators, rooms, giftTransactions: gifts._count, giftVolumeCoins: gifts._sum.totalCoinAmount || 0 };
  }
}
