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

  // Daily new-signups and gift volume over the trailing window, gap-filled so the
  // chart has one point per day (zero days included). ponytail: in-app bucketing
  // over a bounded window — fine at beta scale; move to a SQL date_trunc rollup
  // if the window or row volume grows.
  async dailySeries(days = 30) {
    const n = Math.min(Math.max(Math.trunc(days) || 30, 1), 365); // bounded: 1..365
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (n - 1)); // n buckets including today

    const [users, gifts, rooms, creators] = await Promise.all([
      this.prisma.user.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.prisma.giftTransaction.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true, totalCoinAmount: true } }),
      this.prisma.liveRoom.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.prisma.creatorProfile.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } })
    ]);

    const dayKey = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const buckets = new Map<
      string,
      { day: string; newUsers: number; giftCount: number; giftVolumeCoins: number; newRooms: number; newCreators: number }
    >();
    for (let i = 0; i < n; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = dayKey(d);
      buckets.set(key, { day: key, newUsers: 0, giftCount: 0, giftVolumeCoins: 0, newRooms: 0, newCreators: 0 });
    }
    for (const u of users) {
      const b = buckets.get(dayKey(u.createdAt));
      if (b) b.newUsers++;
    }
    for (const g of gifts) {
      const b = buckets.get(dayKey(g.createdAt));
      if (b) {
        b.giftCount++;
        b.giftVolumeCoins += g.totalCoinAmount;
      }
    }
    // Rooms opened and creators onboarded per day. These are FLOW metrics —
    // unlike the dashboard's backlog counters (open reports, pending payouts),
    // a day-over-day delta is meaningful for them.
    for (const r of rooms) {
      const b = buckets.get(dayKey(r.createdAt));
      if (b) b.newRooms++;
    }
    for (const c of creators) {
      const b = buckets.get(dayKey(c.createdAt));
      if (b) b.newCreators++;
    }
    return [...buckets.values()];
  }
}
