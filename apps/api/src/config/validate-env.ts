// Fail fast on boot if production is misconfigured. In dev we allow placeholder/
// fallback values for convenience; in production those are a security hole.
const PROD_REQUIRED = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'PAYSTACK_SECRET_KEY'
];

// Known unsafe placeholder/fallback values that must never run in production.
const UNSAFE_VALUES: Record<string, string[]> = {
  JWT_ACCESS_SECRET: ['dev', 'replace_with_long_random_access_secret'],
  JWT_REFRESH_SECRET: ['dev-refresh', 'replace_with_long_random_refresh_secret'],
  PAYSTACK_SECRET_KEY: ['replace_me'],
  LIVEKIT_API_SECRET: ['secret']
};

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = PROD_REQUIRED.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }

  const unsafe = Object.entries(UNSAFE_VALUES)
    // Every UNSAFE_VALUES key is also in PROD_REQUIRED, so it is guaranteed
    // present by the missing-vars check above; the '' fallback is defensive.
    .filter(([key, vals]) => vals.includes(process.env[key] ?? /* istanbul ignore next */ ''))
    .map(([key]) => key);
  if (unsafe.length) {
    throw new Error(`Refusing to start: unsafe placeholder values in production for ${unsafe.join(', ')}`);
  }

  if (process.env.REQUIRE_ADMIN_MFA !== 'true') {
    throw new Error('Refusing to start: REQUIRE_ADMIN_MFA must be true in production');
  }

  if (process.env.ENABLE_MOCK_PAYMENTS === 'true') {
    throw new Error('Refusing to start: ENABLE_MOCK_PAYMENTS must not be true in production');
  }
}
