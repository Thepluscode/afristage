#!/usr/bin/env node
// Were free coins actually minted through the mock payment route?
//
// POST /payments/mock/:id/complete credits coins without money changing hands.
// It is guarded by NODE_ENV + ENABLE_MOCK_PAYMENTS — and on 2026-09-22 BOTH
// were wrong in production: NODE_ENV was unset (so the guard's
// `=== 'production'` was false) and ENABLE_MOCK_PAYMENTS was explicitly 'true'.
// Either alone opened it.
//
// "It was possible" and "it happened" are different claims. This answers the
// second. READ-ONLY.
//
//   DATABASE_URL="$(railway variables --service Postgres --kv | sed -n 's/^DATABASE_PUBLIC_URL=//p')" \
//     node scripts/audit-mock-payments.mjs
//
// Exit 0 = no mock intent was ever credited. 1 = some were. 2 = could not run,
// which is not the same as clean and must not be read as it. The code is
// returned from main() and applied after disconnect — process.exit() inside a
// try whose finally awaits $disconnect() races the cleanup and can exit
// non-zero while the message says everything is fine.
import { PrismaClient } from '@prisma/client';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — refusing to guess which database to audit.');
    return 2;
  }

  const prisma = new PrismaClient();
  try {
    const all = await prisma.paymentIntent.findMany({
      where: { provider: 'mock' },
      select: { id: true, userId: true, status: true, amountMinor: true, currency: true, coinAmount: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    const credited = all.filter((i) => i.status === 'SUCCEEDED');
    console.log(`mock payment intents, any status: ${all.length}`);
    console.log(`mock intents CREDITED (status SUCCEEDED): ${credited.length}`);

    if (!credited.length) {
      console.log('\nNo mock intent was ever credited. The route was open; nobody used it.');
      return 0;
    }

    const byUser = new Map();
    let coins = 0n;
    for (const i of credited) {
      coins += BigInt(i.coinAmount ?? 0);
      byUser.set(i.userId, (byUser.get(i.userId) ?? 0) + 1);
    }

    console.log(`\ncoins credited without payment: ${coins}`);
    console.log(`distinct users: ${byUser.size}\n`);
    for (const i of credited.slice(0, 25)) {
      console.log(`  ${i.createdAt.toISOString().slice(0, 16)}  user ${i.userId.slice(0, 8)}…  ${i.coinAmount} coins  intent ${i.id}`);
    }
    if (credited.length > 25) console.log(`  … and ${credited.length - 25} more`);

    console.log('\nThese are credits with no money behind them. Before writing any of it off, check what');
    console.log('became of the coins: gifts sent, diamonds earned, payouts requested or already paid.');
    console.log('A payout funded by a mock credit is real money leaving the business.');
    return 1;
  } catch (error) {
    console.error(`AUDIT COULD NOT RUN: ${error.message}`);
    console.error('This is not a clean result. Fix the connection and run it again.');
    return 2;
  } finally {
    await prisma.$disconnect();
  }
}

process.exit(await main());
