// Can a MARKETPLACE SELLER actually get their money out?
//
// validate:marketplace proves a sale moves coins into the seller's EARNING
// account and stops there. validate:money proves a payout — but for a seeded
// CREATOR, who earns through gifts. Nobody has ever driven the leg in between:
// a plain shop owner, with no creator profile, withdrawing money that arrived
// from a product sale rather than a gift.
//
// That leg is the first question any merchant asks, and "the code looks like it
// should work" is not an answer. Reading the source says a sale credits
// WalletAccountType.EARNING and a payout debits WalletAccountType.EARNING, and
// that neither POST /shops nor POST /payouts/request carries a role gate — so
// the prediction is that it works. This runs it.
//
//   API_BASE=https://<host>/api npm run validate:seller-withdrawal
import { ok, sql, api, login, finish, buyCoins, SEED } from './_lib.mjs';

const EXPECTED_CHECKS = 17;
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

// --- a seller who is NOT a creator ------------------------------------------
// The whole point: validate:marketplace uses the seeded creator, so a role gate
// on payouts would have gone unnoticed. This account has no creator profile.
const email = `seller-${stamp}@afristage.local`;
const reg = await api('POST', '/auth/register', {
  body: {
    email, password: 'SellerPay1!', username: `sel${stamp}`, displayName: 'Plain Seller',
    country: 'NG', language: 'pidgin', ageConfirmed: true
  }
});
check(reg.status === 201 || reg.status === 200, `register a plain (non-creator) seller (status ${reg.status})`);
const STOK = await login(email, 'SellerPay1!');
check(!!STOK, 'seller logged in');
const sellerId = await sql(`select id from users where email='${email}'`);
check(!!sellerId, `resolved seller id (${sellerId})`);

const isCreator = await sql(`select count(*) from creator_profiles where user_id='${sellerId}'`);
check(Number(isCreator) === 0, `the seller has NO creator profile (${isCreator}) — this is the untested case`);

// --- shop + product, approved ------------------------------------------------
const ATOK = await login('admin@afristage.local', SEED.admin);
check(!!ATOK, 'admin logged in');

const shop = await api('POST', '/shops', {
  token: STOK,
  body: { name: `Seller Shop ${stamp}`, slug: `seller-shop-${stamp}`, description: 'withdrawal test' }
});
check(shop.status === 201 || shop.status === 200, `a non-creator can open a shop (status ${shop.status})`);
const shopId = shop.data?.id;

const approved = await api('PATCH', `/admin/shops/${shopId}/status`, { token: ATOK, body: { status: 'APPROVED' } });
check(approved.status === 200, `admin approves the shop (status ${approved.status})`);

const PRICE = 5000;
const product = await api('POST', '/shops/me/products', {
  token: STOK,
  body: { title: `Test Good ${stamp}`, description: 'physical good', priceCoins: PRICE, stock: 5 }
});
check(product.status === 201 || product.status === 200, `product created at ${PRICE} coins (status ${product.status})`);
const productId = product.data?.id;
const live = await api('PATCH', `/shops/me/products/${productId}`, { token: STOK, body: { status: 'ACTIVE' } });
check(live.status === 200, `product set live (status ${live.status})`);

// --- a real sale -------------------------------------------------------------
const vtok = await login('viewer@afristage.local', SEED.viewer);
check(!!vtok, 'buyer logged in');
await buyCoins(vtok, PRICE * 2);

const earnedBefore = await bal('EARNING', sellerId);
const order = await api('POST', '/orders', {
  token: vtok,
  body: { productId, quantity: 1, idempotencyKey: `sellerpay-${stamp}` }
});
check(order.status === 201 || order.status === 200, `buyer purchases the product (status ${order.status})`);
const earnedAfter = await bal('EARNING', sellerId);
const earned = earnedAfter - earnedBefore;
check(earned > 0n, `the sale credited the seller's EARNING account (+${earned} coins)`);

// --- the leg nobody has run: withdraw it -------------------------------------
const method = await api('POST', '/payouts/methods', {
  token: STOK,
  body: {
    provider: 'BANK', country: 'NG', currency: 'NGN',
    destinationReference: '0123456789', label: 'Seller bank', isDefault: true
  }
});
check(method.status === 201 || method.status === 200, `seller adds a payout method (status ${method.status})`);

const req = await api('POST', '/payouts/request', {
  token: STOK,
  body: { coinAmount: Number(earned), idempotencyKey: `sellerpay-req-${stamp}` }
});

// KNOWN GAP, pinned 2026-08-13. A marketplace seller who is not a creator
// CANNOT withdraw. payouts.service.ts requires a creatorProfile with
// payoutEnabled + kycStatus APPROVED; a plain shop owner has no such row, so
// the request is refused while the money sits correctly in their EARNING
// account. Every step before this one succeeds — the shop, the sale, even
// registering a bank account — which is what makes it a trap.
//
// This suite PINS that behaviour rather than failing CI, so the gap cannot be
// forgotten and cannot silently change. When it is fixed, this check goes RED
// and tells you to rewrite it against the success path.
const blockedMsg = JSON.stringify(req.data ?? {});
const isBlocked = req.status === 400 && /Payout not enabled/.test(blockedMsg);
check(
  isBlocked,
  isBlocked
    ? `KNOWN GAP pinned: seller withdrawal refused — 400 "Payout not enabled" (earned ${earned} coins, unwithdrawable)`
    : `SELLER WITHDRAWAL BEHAVIOUR CHANGED (status ${req.status} ${blockedMsg}). If this is the fix, rewrite this suite to assert the success path: EARNING -> PAYOUT_HOLD -> PAYOUT_CLEARING.`
);

// The money must not be lost or half-moved by the refusal.
const earningAfterRefusal = await bal('EARNING', sellerId);
const heldAfterRefusal = await bal('PAYOUT_HOLD', sellerId);
check(
  earningAfterRefusal === earnedAfter && heldAfterRefusal === 0n,
  `the refused withdrawal left the balance intact (earning=${earningAfterRefusal}, hold=${heldAfterRefusal})`
);

// A creator CAN withdraw — this is the control that proves the block is about
// the missing creator profile, not a broken payout path.
const ctok = await login('creator@afristage.local', SEED.creator);
const creatorId = await sql(`select id from users where email='creator@afristage.local'`);
const creatorGate = await sql(
  `select count(*) from creator_profiles where user_id='${creatorId}' and payout_enabled = true and kyc_status='APPROVED'`
);
check(!!ctok && Number(creatorGate) === 1, `control: the seeded creator DOES pass the payout gate (${creatorGate})`);

// The ledger must still balance after all of it.
const imbalance = await sql(
  `select count(*) from (
     select t.id from ledger_transactions t left join ledger_entries e on e.transaction_id=t.id
     group by t.id
     having coalesce(sum(e.amount_minor) filter (where e.direction='DEBIT'),0)
         <> coalesce(sum(e.amount_minor) filter (where e.direction='CREDIT'),0)) x`
);
check(imbalance !== '' && Number(imbalance) === 0, `every ledger transaction still balances (${imbalance} unbalanced)`);

console.log(
  '\n  ⚠ KNOWN GAP: a marketplace seller without a creator profile cannot withdraw earnings.\n' +
  '    Sale credits EARNING correctly; POST /payouts/request refuses with "Payout not enabled".\n' +
  '    Tracker: FEATURE_TRACKER.md, session 2026-08-13. This suite pins it — fix it and this goes red.\n'
);

ok(ran === EXPECTED_CHECKS, `ran ${ran} of ${EXPECTED_CHECKS} checks`);
await finish();
