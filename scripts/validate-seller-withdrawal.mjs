// Can a MARKETPLACE SELLER actually get their money out?
//
// It used to be: no. A shop owner who was not a creator could register, open a
// shop, sell, accrue a correctly-ledgered EARNING balance and register a bank
// account — then be refused at the withdrawal with 400 "Payout not enabled",
// because the payout gate requires a creatorProfile and shop creation did not.
// Every step before the money left succeeded, so the trap was invisible until a
// merchant tried to get paid. The gap sat exactly between two green suites:
// validate:marketplace stops at the EARNING credit, validate:money exercises a
// payout but only for a seeded CREATOR earning through gifts.
//
// The two endpoints disagreed about who a seller is. Shop creation was the side
// that was wrong — the marketplace is creator-led by construction (pinProduct
// requires room.hostUserId === userId, so a seller sells their own products in
// their own live room). Selling now requires a creator account, and the trap is
// refused at the entrance instead of at the till.
//
// This suite proves BOTH halves: the door is shut, and the path behind it works
// end to end.
//
//   API_BASE=https://<host>/api npm run validate:seller-withdrawal
import { ok, sql, api, login, finish, buyCoins, SEED } from './_lib.mjs';

const EXPECTED_CHECKS = 21;
let ran = 0;
const check = (cond, msg) => {
  ran += 1;
  ok(cond, msg);
};

const stamp = Date.now();
// sql() returns the first column of the first row as a STRING, not rows.
const bal = async (type, userId) =>
  BigInt(
    (await sql(`select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0)
                from ledger_entries e join wallet_accounts a on a.id=e.account_id
                where a.user_id='${userId}' and a.account_type='${type}'`)) || 0
  );

console.log('\n=== THE DOOR: selling requires a creator account ===');

const email = `seller-${stamp}@afristage.local`;
const reg = await api('POST', '/auth/register', {
  body: {
    email, password: 'SellerPay1!', username: `sel${stamp}`, displayName: 'Plain Seller',
    country: 'NG', language: 'pidgin', ageConfirmed: true
  }
});
check(reg.status === 201 || reg.status === 200, `register a plain (non-creator) account (status ${reg.status})`);
const STOK = await login(email, 'SellerPay1!');
check(!!STOK, 'non-creator logged in');
const sellerId = await sql(`select id from users where email='${email}'`);
check(!!sellerId, `resolved account id (${sellerId})`);
check(
  Number(await sql(`select count(*) from creator_profiles where user_id='${sellerId}'`)) === 0,
  'the account has NO creator profile'
);

// REGRESSION: this returned 201 before the fix, and the money trap opened here.
const shopAttempt = await api('POST', '/shops', {
  token: STOK,
  body: { name: `Seller Shop ${stamp}`, slug: `seller-shop-${stamp}`, description: 'should be refused' }
});
check(shopAttempt.status === 403, `a non-creator is REFUSED a shop (status ${shopAttempt.status}, was 201 before the fix)`);
check(
  /creator/i.test(JSON.stringify(shopAttempt.data ?? {})),
  `and the refusal says why: ${JSON.stringify(shopAttempt.data?.message ?? shopAttempt.data)}`
);

// The three payout states used to share one message ("Payout not enabled"), so a
// seller with no profile looked identical to a creator waiting on KYC.
const noProfilePayout = await api('POST', '/payouts/request', {
  token: STOK,
  body: { coinAmount: 500, idempotencyKey: `noprofile-${stamp}` }
});
check(
  /no creator profile/i.test(JSON.stringify(noProfilePayout.data ?? {})),
  `payout without a profile names THAT reason, not a generic one: ${JSON.stringify(noProfilePayout.data?.message)}`
);

console.log('\n=== THE PATH BEHIND IT: a creator-seller gets paid, end to end ===');

const CTOK = await login('creator@afristage.local', SEED.creator);
const ATOK = await login('admin@afristage.local', SEED.admin);
check(!!CTOK && !!ATOK, 'seeded creator + admin logged in');
const creatorId = await sql(`select id from users where email='creator@afristage.local'`);

// One shop per account, so reuse the creator's if earlier suites made one.
let shopId = await sql(`select id from shops where owner_user_id='${creatorId}'`);
if (!shopId) {
  const created = await api('POST', '/shops', { token: CTOK, body: { name: `Creator Shop ${stamp}` } });
  shopId = created.data?.id;
}
check(!!shopId, `the creator has a shop (${shopId})`);
const approved = await api('PATCH', `/admin/shops/${shopId}/status`, { token: ATOK, body: { status: 'APPROVED' } });
check(approved.status === 200, `shop APPROVED (status ${approved.status})`);

const PRICE = 5000;
const product = await api('POST', '/shops/me/products', {
  token: CTOK,
  body: { title: `Payout Good ${stamp}`, description: 'physical good', priceCoins: PRICE, stock: 5 }
});
check(product.status === 201 || product.status === 200, `product listed at ${PRICE} coins (status ${product.status})`);
const productId = product.data?.id;
const live = await api('PATCH', `/shops/me/products/${productId}`, { token: CTOK, body: { status: 'ACTIVE' } });
check(live.status === 200, `product set live (status ${live.status})`);

const vtok = await login('viewer@afristage.local', SEED.viewer);
await buyCoins(vtok, PRICE * 2);
const earnBefore = await bal('EARNING', creatorId);
const order = await api('POST', '/orders', {
  token: vtok,
  body: { productId, quantity: 1, idempotencyKey: `sellerpay-${stamp}` }
});
check(order.status === 201 || order.status === 200, `buyer purchases it (status ${order.status})`);
const earned = (await bal('EARNING', creatorId)) - earnBefore;
check(earned > 0n, `the sale credited the seller's EARNING account (+${earned} coins)`);

const method = await api('POST', '/payouts/methods', {
  token: CTOK,
  body: { provider: 'BANK', country: 'NG', currency: 'NGN', destinationReference: '0123456789', label: `Bank ${stamp}` }
});
check(method.status === 201 || method.status === 200, `seller registers a payout method (status ${method.status})`);

// THE LEG NOBODY HAD EVER RUN: withdrawing money that arrived from a SALE.
const holdBefore = await bal('PAYOUT_HOLD', creatorId);
const req = await api('POST', '/payouts/request', {
  token: CTOK,
  body: { coinAmount: Number(earned), idempotencyKey: `sellerpay-req-${stamp}` }
});
check(
  req.status === 201 || req.status === 200,
  `SELLER WITHDRAWS MARKETPLACE EARNINGS (status ${req.status})${req.status >= 400 ? ` — ${JSON.stringify(req.data)}` : ''}`
);
const payoutId = req.data?.id;

const holdDelta = (await bal('PAYOUT_HOLD', creatorId)) - holdBefore;
const earnDelta = (await bal('EARNING', creatorId)) - earnBefore;
check(
  earned > 0n && holdDelta === earned && earnDelta === 0n,
  `funds moved EARNING -> PAYOUT_HOLD (moved=${earned}, holdDelta=${holdDelta}, earningDelta=${earnDelta})`
);

// PAYOUT_CLEARING is a SYSTEM account, not per-user, and accumulates across
// runs — assert the delta on the system balance, as validate:money does.
const clearingSql = `select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0)
                     from ledger_entries e join wallet_accounts a on a.id=e.account_id
                     where a.user_id is null and a.account_type='PAYOUT_CLEARING'`;
const clearBefore = BigInt((await sql(clearingSql)) || 0);
// These are POSTs: Nest answers 201, not 200. Assert the resulting STATE, which
// is what actually matters and cannot be satisfied by a stray 2xx.
const approveRes = await api('POST', `/admin/payouts/${payoutId}/approve`, { token: ATOK, body: {} });
check(approveRes.data?.status === 'APPROVED', `admin approves the payout (${approveRes.data?.status})`);
const paidRes = await api('POST', `/admin/payouts/${payoutId}/mark-paid`, { token: ATOK, body: {} });
check(paidRes.data?.status === 'PAID', `admin marks it PAID (${paidRes.data?.status})`);
const clearDelta = BigInt((await sql(clearingSql)) || 0) - clearBefore;
const holdEnd = (await bal('PAYOUT_HOLD', creatorId)) - holdBefore;
check(
  clearDelta === earned && holdEnd === 0n,
  `funds settled HOLD -> PAYOUT_CLEARING (clearing +${clearDelta}, hold back to ${holdEnd})`
);

const imbalance = await sql(
  `select count(*) from (
     select t.id from ledger_transactions t left join ledger_entries e on e.transaction_id=t.id
     group by t.id
     having coalesce(sum(e.amount_minor) filter (where e.direction='DEBIT'),0)
         <> coalesce(sum(e.amount_minor) filter (where e.direction='CREDIT'),0)) x`
);
check(imbalance !== '' && Number(imbalance) === 0, `every ledger transaction still balances (${imbalance} unbalanced)`);

ok(ran === EXPECTED_CHECKS, `ran ${ran} of ${EXPECTED_CHECKS} checks`);
await finish();
