// The accounts `prisma/seed.ts` plants, with passwords published in the repo.
//
// They are refused at login in production (auth.service), but that refusal is
// one env var — ALLOW_SEEDED_PROD_LOGIN — away from being switched off, and on
// 2026-09-22 the production database still held `admin@afristage.local` as an
// ACTIVE SUPER_ADMIN created 2026-07-13. A control that depends on a flag
// staying false is thinner than deleting the row.
//
// This list lives here rather than inside auth.service so the audit script and
// the boot-time check read the SAME list. Two copies drift, and the copy that
// drifts is the one protecting production.
export const SEEDED_IDENTIFIERS = ['admin@afristage.local', 'viewer@afristage.local', 'creator@afristage.local'];

export const PRIVILEGED_ROLES = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN', 'PAYOUT_REVIEWER'];

export function isSeededIdentifier(identifier: string | null | undefined): boolean {
  return !!identifier && SEEDED_IDENTIFIERS.includes(identifier.trim().toLowerCase());
}
