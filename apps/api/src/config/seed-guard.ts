/**
 * Refuse to plant demo accounts in a real environment.
 *
 * The seed script creates a SUPER_ADMIN with a published password. Run against a
 * production DATABASE_URL it would sit that account, plus demo viewers, creators
 * and fake live rooms, in the same tables as paying customers — and because the
 * script upserts, a re-run would silently succeed rather than error.
 *
 * Two independent signals, because either alone is easy to get wrong: NODE_ENV,
 * and the database host itself. A local NODE_ENV with a copy-pasted production
 * URL is the realistic accident, and only the host check catches it.
 */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres', 'db', 'host.docker.internal'];

export function assertSeedTargetIsLocal(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ALLOW_DESTRUCTIVE_SEED === 'true') return; // explicit, deliberate override

  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production. Set ALLOW_DESTRUCTIVE_SEED=true only if you truly mean it.');
  }

  let host: string;
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is missing or unparseable, so the target database cannot be identified.');
  }

  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at "${host}", which is not a known local database. ` +
        'Seeding creates a SUPER_ADMIN with a published password. Set ALLOW_DESTRUCTIVE_SEED=true to override.'
    );
  }
}
