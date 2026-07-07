import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const checkEnv = args.has('--env') || process.env.NODE_ENV === 'production';

let pass = 0;
let fail = 0;

function ok(condition, message) {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${message}`);
  condition ? pass++ : fail++;
}

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

function contains(file, needles, label) {
  const text = read(file);
  const missing = needles.filter((needle) => !text.includes(needle));
  ok(missing.length === 0, `${label}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
}

// For a security property that legitimately spans more than one file (e.g. the
// login route wires secure-awareness while the shared cookie helper enforces
// httpOnly). Each needle must appear in at least one of the files.
function containsAcross(files, needles, label) {
  const text = files.map(read).join('\n');
  const missing = needles.filter((needle) => !text.includes(needle));
  ok(missing.length === 0, `${label}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
}

console.log('\n=== PRODUCTION STATIC GATES ===');
contains('apps/api/src/config/validate-env.ts', ['REQUIRE_ADMIN_MFA', 'ENABLE_MOCK_PAYMENTS', 'PAYSTACK_SECRET_KEY', 'LIVEKIT_API_SECRET'], 'API production env validator blocks unsafe launch config');
contains('apps/api/src/modules/auth/auth.service.ts', ['SEEDED_PRODUCTION_IDENTIFIERS', 'ALLOW_SEEDED_PROD_LOGIN', 'Seeded test accounts are disabled in production'], 'seeded test accounts are blocked in production auth');
containsAcross(
  ['apps/admin-web/app/api/auth/login/route.ts', 'apps/admin-web/lib/session.ts'],
  ['ADMIN_COOKIE_SECURE', "req.nextUrl.protocol === 'https:'", 'httpOnly: true'],
  'admin session cookie is httpOnly and secure-aware'
);
contains('apps/admin-web/app/login/page.tsx', ['NEXT_PUBLIC_TERMS_URL', 'NEXT_PUBLIC_PRIVACY_URL', 'Terms', 'Privacy'], 'admin login exposes Terms and Privacy links');
contains('apps/mobile/lib/widgets/afri_ui.dart', ['TERMS_URL', 'PRIVACY_URL', 'AfriLegalLinks', 'launchUrl'], 'mobile has configurable Terms and Privacy links');
contains('apps/mobile/lib/screens/login_screen.dart', ['AfriLegalLinks'], 'mobile login exposes Terms and Privacy');
contains('apps/mobile/lib/screens/register_screen.dart', ['AfriLegalLinks', 'Terms and Privacy'], 'mobile registration exposes legal acceptance');
contains('apps/mobile/lib/screens/onboarding_screen.dart', ['AfriLegalLinks'], 'mobile onboarding keeps legal links reachable');
contains('docs/phase-3-6-beta-launch-operations.md', ['Production readiness flags', 'REQUIRE_ADMIN_MFA=true', 'ENABLE_MOCK_PAYMENTS'], 'operations doc records production readiness flags');
contains('docs/phase-3-7-production-launch-hardening.md', ['Production Launch Hardening', 'launch:production', 'Seeded accounts blocked'], 'production hardening doc records launch gates');

if (checkEnv) {
  console.log('\n=== PRODUCTION ENVIRONMENT GATES ===');
  const required = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'PAYSTACK_SECRET_KEY'
  ];
  // Must stay in lockstep with the API boot validator
  // (apps/api/src/config/validate-env.ts) — the pre-deploy gate should reject
  // anything that would crash the API on startup, so a bad config never ships.
  const unsafe = {
    JWT_ACCESS_SECRET: ['dev', 'replace_with_long_random_access_secret'],
    JWT_REFRESH_SECRET: ['dev-refresh', 'replace_with_long_random_refresh_secret'],
    PAYSTACK_SECRET_KEY: ['replace_me'],
    LIVEKIT_API_KEY: ['devkey'],
    LIVEKIT_API_SECRET: ['secret']
  };

  ok(process.env.NODE_ENV === 'production', 'NODE_ENV is production');
  for (const key of required) ok(Boolean(process.env[key]), `${key} is set`);
  for (const [key, values] of Object.entries(unsafe)) {
    ok(!values.includes(process.env[key] ?? ''), `${key} is not an unsafe placeholder`);
  }
  ok(process.env.REQUIRE_ADMIN_MFA === 'true', 'REQUIRE_ADMIN_MFA=true');
  ok(process.env.ENABLE_MOCK_PAYMENTS !== 'true', 'ENABLE_MOCK_PAYMENTS is not true');
  ok(process.env.ALLOW_SEEDED_PROD_LOGIN !== 'true', 'ALLOW_SEEDED_PROD_LOGIN is not true');
  ok(process.env.ADMIN_COOKIE_SECURE === 'true' || (process.env.ADMIN_BASE_URL || '').startsWith('https://'), 'admin cookies are secure in production context');
  ok(Boolean(process.env.NEXT_PUBLIC_TERMS_URL || process.env.TERMS_URL), 'Terms URL configured');
  ok(Boolean(process.env.NEXT_PUBLIC_PRIVACY_URL || process.env.PRIVACY_URL), 'Privacy URL configured');
} else {
  console.log('\n=== PRODUCTION ENVIRONMENT GATES ===');
  console.log('  SKIP  pass --env or set NODE_ENV=production to verify deployment environment variables');
}

console.log(`\n========================\n  RESULT: ${pass} passed, ${fail} failed\n========================`);
process.exit(fail ? 1 : 0);
