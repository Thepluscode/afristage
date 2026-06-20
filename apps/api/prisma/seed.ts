import 'dotenv/config'; // load apps/api/.env so `npm run seed` works without inline DATABASE_URL
import { PrismaClient, UserRole, CreatorCategory, WalletAccountType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createUser(email: string, password: string, role: UserRole, username: string, displayName: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
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

async function main() {
  await createUser('admin@afristage.local', 'Admin123!', UserRole.SUPER_ADMIN, 'admin', 'AfriStage Admin');
  await createUser('viewer@afristage.local', 'Viewer123!', UserRole.VIEWER, 'viewer', 'Demo Viewer');
  const creator = await createUser('creator@afristage.local', 'Creator123!', UserRole.CREATOR, 'creator', 'Demo Creator');

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
      { name: 'Palm Clap', coinPrice: 10, animationUrl: '/gifts/palm-clap.json' },
      { name: 'Golden Mic', coinPrice: 100, animationUrl: '/gifts/golden-mic.json' },
      { name: 'Jollof Crown', coinPrice: 500, animationUrl: '/gifts/jollof-crown.json' }
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
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
