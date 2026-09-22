#!/usr/bin/env node
// Which seeded demo accounts exist in a given database, and what can they do?
//
// The seed plants a SUPER_ADMIN whose password is published in prisma/seed.ts.
// Production refuses those identifiers at login — but only while
// ALLOW_SEEDED_PROD_LOGIN is not 'true', and on 2026-09-22 production still
// held admin@afristage.local as an ACTIVE SUPER_ADMIN created 2026-07-13.
//
// READ-ONLY. It changes nothing. It prints what it found, and the exact SQL to
// neutralise it, because the fix is a decision (delete? demote? keep for a
// staging clone?) that belongs to an operator, not to a script run by habit.
//
//   DATABASE_URL="$(railway variables --service Postgres --kv | sed -n 's/^DATABASE_PUBLIC_URL=//p')" \
//     node scripts/audit-seeded-accounts.mjs
//
// Exit 0 = nothing privileged found. Exit 1 = something is there. Exit 2 = the
// check could not run, which is NOT the same as "clean" and must not read as it.
import { PrismaClient } from '@prisma/client';

const SEEDED = ['admin@afristage.local', 'viewer@afristage.local', 'creator@afristage.local'];
const PRIVILEGED = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN', 'PAYOUT_REVIEWER'];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to guess which database to audit.');
  process.exit(2);
}

const prisma = new PrismaClient();
try {
  const rows = await prisma.user.findMany({
    where: { email: { in: SEEDED, mode: 'insensitive' } },
    select: { id: true, email: true, role: true, status: true, createdAt: true }
  });

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL).hostname;
    } catch {
      return 'unparseable';
    }
  })();
  console.log(`database host: ${host}`);
  console.log(`seeded accounts present: ${rows.length}`);
  for (const r of rows) {
    const flag = PRIVILEGED.includes(r.role) && r.status !== 'DELETED' ? '  <-- PRIVILEGED AND LIVE' : '';
    console.log(`  ${r.email}  ${r.role}  ${r.status}  created ${r.createdAt.toISOString().slice(0, 10)}${flag}`);
  }

  const live = rows.filter((r) => PRIVILEGED.includes(r.role) && r.status !== 'DELETED');
  if (!live.length) {
    console.log('\nNothing privileged and live. Nothing to do.');
    process.exit(0);
  }

  console.log('\nThese hold privileges with a password published in prisma/seed.ts.');
  console.log('Login refuses them while ALLOW_SEEDED_PROD_LOGIN is not "true" — that flag is the only thing');
  console.log('standing between this row and a production SUPER_ADMIN session. Remove the row, do not trust the flag.\n');
  console.log('To demote and neutralise (keeps the row, so any FKs survive):');
  for (const r of live) {
    console.log(`  UPDATE users SET role='VIEWER', status='SUSPENDED', password_hash=NULL WHERE id='${r.id}';`);
  }
  console.log('\nRe-run this script afterwards — it should report nothing privileged and live.');
  process.exit(1);
} catch (error) {
  console.error(`AUDIT COULD NOT RUN: ${error.message}`);
  console.error('This is not a clean result. Fix the connection and run it again.');
  process.exit(2);
} finally {
  await prisma.$disconnect();
}
