// Is this a real environment, for the purposes of a SECURITY decision?
//
// Every guard in this codebase used to ask `NODE_ENV === 'production'`, which
// treats an ABSENT variable as "not production" — the most permissive reading
// of a value nobody set. On 2026-09-22 NODE_ENV turned out to be unset on the
// production API: not on Railway, not in the Dockerfile, not in compose, not in
// CI. So in production:
//
//   - POST /payments/mock/:id/complete was ENABLED — free coins, which become
//     gifts, which become creator diamonds, which become payouts;
//   - the seeded-admin login block never fired, leaving a SUPER_ADMIN whose
//     password is published in prisma/seed.ts reachable with the right guess;
//   - CORS still allowed localhost origins.
//
// One missing variable, three controls silently off, and every one of them
// looked correct in review.
//
// So: a security gate asks whether this is EXPLICITLY development or test, and
// treats everything else — including unset — as production. Wrong-way failure
// is a nuisance in dev (set NODE_ENV=development); the other way round is what
// the list above describes.
const DEV_OR_TEST = ['development', 'test'];

export function isDevOrTest(env: NodeJS.ProcessEnv = process.env): boolean {
  return DEV_OR_TEST.includes((env.NODE_ENV ?? '').trim().toLowerCase());
}

/** Treat unset/unknown NODE_ENV as production. Use this for every guard whose
 *  failure mode is "a control that should have been on was off". */
export function isProductionLike(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isDevOrTest(env);
}

/** True only when NODE_ENV says production in so many words. For cosmetics and
 *  log lines — never for a control. */
export function isExplicitProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}
