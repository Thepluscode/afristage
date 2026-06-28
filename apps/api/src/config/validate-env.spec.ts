import { validateEnv } from './validate-env';

describe('validateEnv', () => {
  const ORIGINAL = process.env;
  beforeEach(() => {
    process.env = { ...ORIGINAL };
  });
  afterAll(() => {
    process.env = ORIGINAL;
  });

  function setAllGood() {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'a-very-long-random-access-secret';
    process.env.JWT_REFRESH_SECRET = 'another-very-long-random-refresh-secret';
    process.env.LIVEKIT_API_KEY = 'lk_key';
    process.env.LIVEKIT_API_SECRET = 'lk_secret_real';
    process.env.DATABASE_URL = 'postgres://x';
    process.env.REDIS_URL = 'redis://x';
    process.env.PAYSTACK_SECRET_KEY = 'sk_live_real';
    process.env.REQUIRE_ADMIN_MFA = 'true';
    delete process.env.ENABLE_MOCK_PAYMENTS;
  }

  it('no-ops outside production', () => {
    process.env.NODE_ENV = 'development';
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws when required production vars are missing', () => {
    process.env.NODE_ENV = 'production';
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'DATABASE_URL', 'REDIS_URL', 'PAYSTACK_SECRET_KEY']) delete process.env[k];
    expect(() => validateEnv()).toThrow(/Missing required production env vars/);
  });

  it('rejects known unsafe placeholder values', () => {
    setAllGood();
    process.env.JWT_ACCESS_SECRET = 'dev';
    expect(() => validateEnv()).toThrow(/unsafe placeholder values/);
  });

  it('requires REQUIRE_ADMIN_MFA to be true', () => {
    setAllGood();
    process.env.REQUIRE_ADMIN_MFA = 'false';
    expect(() => validateEnv()).toThrow(/REQUIRE_ADMIN_MFA/);
  });

  it('forbids ENABLE_MOCK_PAYMENTS in production', () => {
    setAllGood();
    process.env.ENABLE_MOCK_PAYMENTS = 'true';
    expect(() => validateEnv()).toThrow(/ENABLE_MOCK_PAYMENTS/);
  });

  it('passes for a correctly-configured production env', () => {
    setAllGood();
    expect(() => validateEnv()).not.toThrow();
  });
});
