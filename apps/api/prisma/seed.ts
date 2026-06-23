import 'dotenv/config'; // load apps/api/.env so `npm run seed` works without inline DATABASE_URL
import { PrismaClient, UserRole, CreatorCategory, WalletAccountType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createUser(email: string, password: string, role: UserRole, username: string, displayName: string, avatarUrl?: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { profile: { update: { avatarUrl } } },
    create: {
      email,
      passwordHash,
      role,
      ageConfirmed: true,
      emailVerified: true,
      profile: {
        create: {
          username,
          displayName,
          avatarUrl,
          country: 'NG',
          language: 'pidgin'
        }
      }
    }
  });

  for (const accountType of [WalletAccountType.COIN, WalletAccountType.EARNING, WalletAccountType.PAYOUT_HOLD]) {
    await prisma.walletAccount.createMany({
      data: [{ userId: user.id, accountType, currency: 'COIN' }],
      skipDuplicates: true
    });
  }

  return user;
}

// Demo stage: varied creators with real face photos + a LIVE room each, so the
// feed/room/profile screens demo with actual imagery (not gradient fallbacks).
const DEMO_STAGE = [
  { username: 'amaka_g', name: 'Amaka Gold', img: 45, title: 'Friday Afrobeats Live', category: CreatorCategory.MUSIC, peak: 1240 },
  { username: 'dj_tunde', name: 'DJ Tunde', img: 12, title: 'Amapiano Dance Off', category: CreatorCategory.DANCE, peak: 530 },
  { username: 'kwame_l', name: 'Kwame Live', img: 68, title: 'Lagos Comedy Night', category: CreatorCategory.COMEDY, peak: 210 },
  { username: 'zola_k', name: 'Zola Kim', img: 32, title: 'AFCON Watch Party', category: CreatorCategory.FOOTBALL, peak: 88 }
];

async function seedDemoStage() {
  for (const c of DEMO_STAGE) {
    const email = `${c.username}@afristage.local`;
    const user = await createUser(email, 'Creator123!', UserRole.CREATOR, c.username, c.name, `https://i.pravatar.cc/400?img=${c.img}`);
    await prisma.creatorProfile.upsert({
      where: { userId: user.id },
      update: { approvalStatus: 'APPROVED' },
      create: { userId: user.id, stageName: c.name, category: c.category, country: 'NG', language: 'pidgin', kycStatus: 'APPROVED', approvalStatus: 'APPROVED', payoutEnabled: true }
    });
    const existing = await prisma.liveRoom.findFirst({ where: { hostUserId: user.id, title: c.title } });
    if (!existing) {
      await prisma.liveRoom.create({
        data: { hostUserId: user.id, title: c.title, category: c.category, country: 'NG', language: 'pidgin', status: 'LIVE', startedAt: new Date(), peakViewers: c.peak }
      });
    }
  }
}

async function main() {
  await createUser('admin@afristage.local', 'Admin123!', UserRole.SUPER_ADMIN, 'admin', 'AfriStage Admin', 'https://i.pravatar.cc/400?img=8');
  await createUser('viewer@afristage.local', 'Viewer123!', UserRole.VIEWER, 'viewer', 'Demo Viewer', 'https://i.pravatar.cc/400?img=5');
  const creator = await createUser('creator@afristage.local', 'Creator123!', UserRole.CREATOR, 'creator', 'Demo Creator', 'https://i.pravatar.cc/400?img=15');

  await prisma.creatorProfile.upsert({
    where: { userId: creator.id },
    update: { approvalStatus: 'APPROVED' },
    create: {
      userId: creator.id,
      stageName: 'Demo Creator',
      category: CreatorCategory.MUSIC,
      country: 'NG',
      language: 'pidgin',
      kycStatus: 'APPROVED',
      approvalStatus: 'APPROVED',
      payoutEnabled: true
    }
  });

  await prisma.gift.createMany({
    data: [
      { name: 'Rose', coinPrice: 10 },
      { name: 'Fire', coinPrice: 50 },
      { name: 'Golden Mic', coinPrice: 100 },
      { name: 'Drum', coinPrice: 200 },
      { name: 'Crown', coinPrice: 500 },
      { name: 'Spotlight', coinPrice: 1000 },
      { name: 'Star', coinPrice: 2000 },
      { name: 'Stage', coinPrice: 5000 }
    ],
    skipDuplicates: true
  });

  await prisma.walletAccount.createMany({
    data: [
      { userId: null, accountType: WalletAccountType.PLATFORM_REVENUE, currency: 'COIN' },
      { userId: null, accountType: WalletAccountType.PAYMENT_CLEARING, currency: 'COIN' },
      { userId: null, accountType: WalletAccountType.PAYOUT_CLEARING, currency: 'COIN' }
    ],
    skipDuplicates: true
  });

  await seedDemoStage();
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
