// Dress rehearsal against the REAL payment providers, in test mode.
//
// Every payment test in this repo runs against our own mock. That proves our
// logic and nothing about the provider: whether the key authenticates, whether
// Stripe/Paystack accept the session parameters we send, and above all whether
// the JSON they actually return still matches the shape our providers parse.
// Mocks encode our assumptions, so they agree with us by construction — this is
// the one check that can disagree.
//
// It needs only a TEST secret key (free to create, no business verification):
//   PAYSTACK_SECRET_KEY=sk_test_...   and/or   STRIPE_SECRET_KEY=sk_test_...
//   npm run validate:provider-sandbox
//
// With no keys it skips rather than fails, so it is safe to leave in CI until
// the accounts exist. It NEVER runs against a live key — a key that is not
// clearly test-mode aborts the run.
import { PaystackProvider } from '../apps/api/dist/src/modules/payments/providers/paystack.provider.js';
import { StripeProvider } from '../apps/api/dist/src/modules/payments/providers/stripe.provider.js';

let pass = 0;
let fail = 0;
let skipped = 0;
const ok = (c, m) => {
  console.log(`${c ? '  PASS' : '  FAIL'}  ${m}`);
  c ? pass++ : fail++;
};
const skip = (m) => {
  console.log(`  SKIP  ${m}`);
  skipped++;
};

const isTestKey = (k) => /^(sk_test_|rk_test_)/.test(k ?? '');
const ref = (p) => `rehearsal-${p}-${Date.now()}`;

// --- Paystack ---------------------------------------------------------------
const paystackKey = process.env.PAYSTACK_SECRET_KEY;
if (!paystackKey || paystackKey === 'replace_me' || paystackKey.startsWith('sk_test_phase4')) {
  skip('Paystack — set PAYSTACK_SECRET_KEY to a real sk_test_... key to rehearse');
} else if (!isTestKey(paystackKey)) {
  ok(false, 'Paystack key is NOT a test key — refusing to run against live money');
} else {
  const provider = new PaystackProvider();
  ok(provider.isConfigured(), 'Paystack provider reports configured');
  const reference = ref('ps');
  try {
    // ₦1,000 → 100000 kobo, matching the `starter` package.
    const init = await provider.initialize({ email: 'rehearsal@afristage.test', amountMinor: 100000, currency: 'NGN', reference });
    ok(/^https:\/\//.test(init.checkoutUrl), `Paystack returned a hosted checkout URL (${init.checkoutUrl.slice(0, 48)}…)`);
    ok(init.providerReference === reference, `Paystack echoed our reference (${init.providerReference})`);

    // The response shape our webhook/verify path depends on, straight from the
    // real API. Unpaid, so success must be false — a `true` here would mean we
    // are reading the wrong field.
    const v = await provider.verify(reference);
    ok(v.success === false, `unpaid transaction verifies as not-successful (success=${v.success})`);
    ok(v.amountMinor === 100000, `verify reports the amount we asked for (${v.amountMinor} kobo)`);
    ok(v.currency === 'NGN', `verify reports the currency we asked for (${v.currency})`);
    console.log(`\n  → Finish the rehearsal by hand: open ${init.checkoutUrl}`);
    console.log(`    pay with Paystack's test card, then re-run verify for reference ${reference}.\n`);
  } catch (e) {
    ok(false, `Paystack rehearsal threw: ${e?.message ?? e}`);
  }
}

// --- Stripe -----------------------------------------------------------------
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey || stripeKey === 'replace_me') {
  skip('Stripe — set STRIPE_SECRET_KEY to a real sk_test_... key to rehearse');
} else if (!isTestKey(stripeKey)) {
  ok(false, 'Stripe key is NOT a test key — refusing to run against live money');
} else {
  const provider = new StripeProvider();
  ok(provider.isConfigured(), 'Stripe provider reports configured');
  const reference = ref('st');
  try {
    // $1.00 → 100 cents, matching the `starter_usd` package.
    const init = await provider.initialize({ email: 'rehearsal@afristage.test', amountMinor: 100, currency: 'USD', reference });
    ok(/^https:\/\//.test(init.checkoutUrl), `Stripe returned a hosted checkout URL (${init.checkoutUrl.slice(0, 48)}…)`);
    ok(/^cs_test_/.test(init.providerReference), `Stripe returned a test checkout session id (${init.providerReference})`);

    const v = await provider.verify(init.providerReference);
    ok(v.success === false, `an unpaid session verifies as not-successful (success=${v.success})`);
    ok(v.amountMinor === 100, `verify reports the amount we asked for (${v.amountMinor} cents)`);
    ok(String(v.currency).toUpperCase() === 'USD', `verify reports the currency we asked for (${v.currency})`);
    console.log(`\n  → Finish the rehearsal by hand: open ${init.checkoutUrl}`);
    console.log('    pay with 4242 4242 4242 4242, then replay the webhook with:');
    console.log('    stripe listen --forward-to localhost:3000/api/payments/webhooks/stripe\n');
  } catch (e) {
    ok(false, `Stripe rehearsal threw: ${e?.message ?? e}`);
  }
}

console.log(`\n========================\n  RESULT: ${pass} passed, ${fail} failed, ${skipped} skipped\n========================`);
if (skipped && !pass && !fail) console.log('  Nothing rehearsed. This proves nothing about the providers yet.\n');
process.exit(fail ? 1 : 0);
