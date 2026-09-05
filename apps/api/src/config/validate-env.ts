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

export function validateEnv(): void {
  // Say it out loud on every boot. A weakened review gate that nobody remembers
  // enabling is how a beta shortcut becomes the permanent default.
  if (process.env.BETA_AUTO_APPROVE_CREATORS === 'true') {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] BETA_AUTO_APPROVE_CREATORS=true — creator applications are approved WITHOUT human review. Beta only.'
    );
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
