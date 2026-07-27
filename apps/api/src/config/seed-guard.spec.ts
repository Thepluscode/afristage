import { assertSeedTargetIsLocal } from './seed-guard';

const local = { DATABASE_URL: 'postgresql://u:p@localhost:5432/afristage' } as NodeJS.ProcessEnv;

describe('assertSeedTargetIsLocal', () => {
  it('allows the known local hosts', () => {
    for (const host of ['localhost', '127.0.0.1', 'postgres', 'db', 'host.docker.internal']) {
      expect(() => assertSeedTargetIsLocal({ DATABASE_URL: `postgresql://u:p@${host}:5432/afristage` })).not.toThrow();
    }
  });

  it('refuses when NODE_ENV is production even if the host looks local', () => {
    expect(() => assertSeedTargetIsLocal({ ...local, NODE_ENV: 'production' })).toThrow(/NODE_ENV=production/);
  });

  it('refuses a remote host even when NODE_ENV is not production', () => {
    // the realistic accident: a local shell with a copy-pasted production URL
    expect(() =>
      assertSeedTargetIsLocal({ DATABASE_URL: 'postgresql://u:p@db.prod.railway.app:5432/railway' })
    ).toThrow(/not a known local database/);
  });

  it('names the offending host so the mistake is obvious', () => {
    expect(() => assertSeedTargetIsLocal({ DATABASE_URL: 'postgresql://u:p@shortline.proxy.rlwy.net:1234/railway' })).toThrow(
      /"shortline\.proxy\.rlwy\.net"/
    );
  });

  it('refuses rather than guessing when DATABASE_URL is missing or unparseable', () => {
    expect(() => assertSeedTargetIsLocal({})).toThrow(/missing or unparseable/);
    expect(() => assertSeedTargetIsLocal({ DATABASE_URL: 'not-a-url' })).toThrow(/missing or unparseable/);
  });

  it('honours an explicit override, including against production', () => {
    expect(() =>
      assertSeedTargetIsLocal({ DATABASE_URL: 'postgresql://u:p@db.prod:5432/x', NODE_ENV: 'production', ALLOW_DESTRUCTIVE_SEED: 'true' })
    ).not.toThrow();
  });

  it('treats any value other than the exact string "true" as no override', () => {
    for (const v of ['1', 'yes', 'TRUE', '']) {
      expect(() => assertSeedTargetIsLocal({ DATABASE_URL: 'postgresql://u:p@db.prod:5432/x', ALLOW_DESTRUCTIVE_SEED: v })).toThrow();
    }
  });
});
