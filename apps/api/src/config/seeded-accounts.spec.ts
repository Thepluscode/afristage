import { PRIVILEGED_ROLES, SEEDED_IDENTIFIERS, isSeededIdentifier } from './seeded-accounts';

describe('seeded account identification', () => {
  it('knows the accounts the seed actually plants', () => {
    // Hard-coded rather than derived from the seed script: a list checked
    // against its own source cannot notice the source changing.
    expect(SEEDED_IDENTIFIERS).toEqual([
      'admin@afristage.local',
      'viewer@afristage.local',
      'creator@afristage.local'
    ]);
  });

  it('matches regardless of casing or stray whitespace', () => {
    expect(isSeededIdentifier('ADMIN@AfriStage.Local')).toBe(true);
    expect(isSeededIdentifier('  admin@afristage.local  ')).toBe(true);
  });

  it('does not match a real account that merely looks similar', () => {
    expect(isSeededIdentifier('admin@afristage.live')).toBe(false);
    expect(isSeededIdentifier('ogievat@yahoo.com')).toBe(false);
    expect(isSeededIdentifier('')).toBe(false);
    expect(isSeededIdentifier(null)).toBe(false);
    expect(isSeededIdentifier(undefined)).toBe(false);
  });

  it('lists every role that can act on other people or on money', () => {
    expect(PRIVILEGED_ROLES).toEqual(['MODERATOR', 'ADMIN', 'SUPER_ADMIN', 'PAYOUT_REVIEWER']);
  });
});
