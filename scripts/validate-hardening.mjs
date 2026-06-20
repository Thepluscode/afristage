import crypto from 'node:crypto';
import { ok, sql, api, login, finish } from './_lib.mjs';

const SECRET = 'sk_test_phase4_secret'; // must match PAYSTACK_SECRET_KEY in apps/api/.env
const sign = (rawStr) => crypto.createHmac('sha512', SECRET).update(rawStr).digest('hex');

// --- setup (do auth logins first, before the rate-limit burst starves them) ---
const ATOK = await login('admin@afristage.local', 'Admin123!');
const viewerId = await sql("select id from users where email='viewer@afristage.local'");
const stamp = Date.now();
const ref = `ps_phase4_${stamp}`;
const coinAmt = 500, amtMinor = 50000;
await sql(`insert into payment_intents (id, user_id, provider, amount_minor, currency, coin_amount, status, provider_reference, created_at, updated_at) values (gen_random_uuid(), '${viewerId}', 'paystack', ${amtMinor}, 'NGN', ${coinAmt}, 'PENDING', '${ref}', now(), now())`);

const coinBalance = () => sql(`select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.user_id='${viewerId}' and wa.account_type='COIN'`);

console.log('\n=== PAYSTACK WEBHOOK signature verification ===');
const goodBody = JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: amtMinor, currency: 'NGN' } });

// 1. bad signature rejected
const bad = await api('POST', '/payments/webhooks/paystack', { raw: goodBody, headers: { 'x-paystack-signature': 'deadbeef' } });
ok(bad.status === 401, `invalid signature rejected 401 (got ${bad.status})`);

// 2. no signature rejected
const none = await api('POST', '/payments/webhooks/paystack', { raw: goodBody });
ok(none.status === 401, `missing signature rejected 401 (got ${none.status})`);

// 3. amount mismatch rejected even with valid signature
const mismatchBody = JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: 999, currency: 'NGN' } });
const mm = await api('POST', '/payments/webhooks/paystack', { raw: mismatchBody, headers: { 'x-paystack-signature': sign(mismatchBody) } });
ok(mm.status === 400, `amount mismatch rejected 400 (got ${mm.status})`);

// 4. valid signature credits coins
const before = BigInt(await coinBalance());
const good = await api('POST', '/payments/webhooks/paystack', { raw: goodBody, headers: { 'x-paystack-signature': sign(goodBody) } });
ok(good.status === 200 && good.data?.matched === true, `valid webhook accepted + matched (status ${good.status})`);
const after = BigInt(await coinBalance());
ok(after - before === BigInt(coinAmt), `coins credited via webhook (+${after - before}, expected +${coinAmt})`);
ok(await sql(`select status from payment_intents where provider_reference='${ref}'`) === 'SUCCEEDED', 'intent marked SUCCEEDED');

// 5. replay is idempotent (no double credit)
const replay = await api('POST', '/payments/webhooks/paystack', { raw: goodBody, headers: { 'x-paystack-signature': sign(goodBody) } });
const afterReplay = BigInt(await coinBalance());
ok(replay.status === 200 && afterReplay === after, `webhook replay does not double-credit (balance still ${afterReplay})`);

console.log('\n=== LEDGER INTEGRITY endpoint ===');
const integ = await api('GET', '/admin/ledger/integrity', { token: ATOK });
ok(integ.status === 200 && integ.data?.ok === true, `integrity check ok=true (${JSON.stringify(integ.data?.currencies)})`);
ok(integ.data?.unbalancedTransactions === 0, `zero unbalanced transactions (${integ.data?.unbalancedTransactions})`);

console.log('\n=== RATE LIMITING (auth = 10/min/IP) — run LAST ===');
let got429 = false, statuses = [];
for (let i = 0; i < 15; i++) {
  const r = await api('POST', '/auth/login', { body: { identifier: 'nobody@test.local', password: 'x' } });
  statuses.push(r.status);
  if (r.status === 429) got429 = true;
}
ok(got429, `burst of 8 logins triggered 429 (statuses: ${statuses.join(',')})`);

await finish();
