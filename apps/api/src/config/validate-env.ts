// Fail fast on boot if production is misconfigured. In dev we allow placeholder/
// fallback values for convenience; in production those are a security hole.
const PROD_REQUIRED = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  // Without this the API would refuse every browser origin in production. Crash
  // at boot instead: a dead service is diagnosed in minutes, an API that
  // silently rejects the admin UI's every request is diagnosed in hours.
  'CORS_ORIGINS'
];

// Taking money needs A processor, not a SPECIFIC one.
//
// PAYSTACK_SECRET_KEY used to sit in PROD_REQUIRED above, which quietly made an
// African corridor mandatory: a Stripe-only launch could not boot at all, and
// the crash named a vendor the operator had deliberately chosen not to use.
// Meanwhile STRIPE_SECRET_KEY was required nowhere, so the one provider that
// WAS configured counted for nothing. Either key satisfies the requirement; the
// placeholder rules below still apply to whichever one is set.
const PAYMENT_PROVIDER_KEYS = ['PAYSTACK_SECRET_KEY', 'STRIPE_SECRET_KEY'];

// Known unsafe placeholder/fallback values that must never run in production.
const UNSAFE_VALUES: Record<string, string[]> = {
  JWT_ACCESS_SECRET: ['dev', 'replace_with_long_random_access_secret'],
  JWT_REFRESH_SECRET: ['dev-refresh', 'replace_with_long_random_refresh_secret'],
  PAYSTACK_SECRET_KEY: ['replace_me'],
  STRIPE_SECRET_KEY: ['replace_me'],
  LIVEKIT_API_KEY: ['devkey'],
  LIVEKIT_API_SECRET: ['secret']
};

// A copy-pasted setup command leaves values like "<account-id>" or
// "PASTE_KEY_ID" behind, and every truthiness check in the codebase accepts
// them: on 2026-09-21 S3_ENDPOINT held the literal "<account-id>" while
// isConfigured() reported uploads as ready, so presign returned a signed URL
// pointing at a hostname that does not resolve. The failure moved from the API,
// where it was legible, to the browser, where it was not.
//
// Prefix-scoped so Railway's own injected variables cannot trip it.
const CONFIG_PREFIXES = ['S3_', 'CDN_', 'EMAIL_', 'RESEND_', 'STRIPE_', 'PAYSTACK_', 'LIVEKIT_', 'CORS_', 'WEB_', 'DATABASE_', 'REDIS_', 'JWT_'];
// `<...>` only counts when the brackets do NOT wrap an email address:
// EMAIL_FROM legitimately reads `AfriStage <no-reply@example.com>`, and a guard
// that refuses to boot on correct production config gets deleted, not fixed.
// (Caught by its own test before shipping — the first version did exactly that.)
const TEMPLATE_PLACEHOLDER = /<[^>@]+>|\bPASTE[_A-Z]*\b|\bYOUR_[A-Z_]+\b/;

// Values that must parse as an http(s) URL if present at all. A bare hostname
// or a stray quote here produces a signed URL nobody can reach.
const URL_VALUED = ['S3_ENDPOINT', 'CDN_BASE_URL', 'S3_PUBLIC_URL', 'WEB_BASE_URL'];

export function placeholderConfigKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(env)
    .filter(([key, value]) => CONFIG_PREFIXES.some((p) => key.startsWith(p)) && TEMPLATE_PLACEHOLDER.test(value ?? ''))
    .map(([key]) => key)
    .sort();
}

export function malformedUrlConfigKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return URL_VALUED.filter((key) => {
    const value = env[key];
    if (!value) return false; // absent is a different problem, reported elsewhere
    try {
      const parsed = new URL(value);
      return parsed.protocol !== 'http:' && parsed.protocol !== 'https:';
    } catch {
      return true;
    }
  }).sort();
}

export function validateEnv(): void {
  // Say it out loud on every boot. A weakened review gate that nobody remembers
  // enabling is how a beta shortcut becomes the permanent default.
  if (process.env.BETA_AUTO_APPROVE_CREATORS === 'true') {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] BETA_AUTO_APPROVE_CREATORS=true — creator applications are approved WITHOUT human review. Beta only.'
    );
  }

  // Runs in EVERY environment, not just production: a placeholder in dev wastes
  // the same afternoon, and the value never names itself in the error it causes.
  // Key names only in the message — the values can be secrets.
  const placeholders = placeholderConfigKeys();
  if (placeholders.length) {
    throw new Error(
      `Refusing to start: these config vars still hold template placeholders, not real values: ${placeholders.join(', ')}`
    );
  }
  const malformed = malformedUrlConfigKeys();
  if (malformed.length) {
    throw new Error(`Refusing to start: these config vars must be http(s) URLs: ${malformed.join(', ')}`);
  }

  if (process.env.NODE_ENV !== 'production') return;

  const missing = PROD_REQUIRED.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }

  const unsafe = Object.entries(UNSAFE_VALUES)
    // The payment-provider keys are OPTIONAL individually (see
    // PAYMENT_PROVIDER_KEYS), so an unset one reaches here as ''. No entry in
    // UNSAFE_VALUES lists '', which is what keeps an absent key from being
    // reported as a placeholder.
    .filter(([key, vals]) => vals.includes(process.env[key] ?? ''))
    .map(([key]) => key);
  if (unsafe.length) {
    throw new Error(`Refusing to start: unsafe placeholder values in production for ${unsafe.join(', ')}`);
  }

  // At least one processor must be able to take a payment. Checked after the
  // placeholder rules so `PAYSTACK_SECRET_KEY=replace_me` reports the specific
  // problem rather than the generic one.
  const configuredProviders = PAYMENT_PROVIDER_KEYS.filter((key) => !!process.env[key]);
  if (!configuredProviders.length) {
    throw new Error(
      `Refusing to start: no payment provider configured — set at least one of ${PAYMENT_PROVIDER_KEYS.join(' or ')}`
    );
  }

  if (process.env.REQUIRE_ADMIN_MFA !== 'true') {
    throw new Error('Refusing to start: REQUIRE_ADMIN_MFA must be true in production');
  }

  if (process.env.ENABLE_MOCK_PAYMENTS === 'true') {
    throw new Error('Refusing to start: ENABLE_MOCK_PAYMENTS must not be true in production');
  }

  // The seeded demo accounts are blocked from production login by default; the
  // escape hatch exists for staging environments only. Enforce at boot, not
  // just at the login guard, so a copy-pasted staging env can't weaken prod.
  if (process.env.ALLOW_SEEDED_PROD_LOGIN === 'true') {
    throw new Error('Refusing to start: ALLOW_SEEDED_PROD_LOGIN must not be true in production');
  }

  // Auto-approval removes the human review that decides who may broadcast to an
  // audience. That trade is defensible for a controlled beta on staging, where
  // every applicant is someone we invited; in production it means anyone who
  // signs up can go live unreviewed. Enforce at boot so a copied staging env
  // can't carry it into production silently.
  if (process.env.BETA_AUTO_APPROVE_CREATORS === 'true') {
    throw new Error('Refusing to start: BETA_AUTO_APPROVE_CREATORS must not be true in production');
  }
}
