import { ok, sql, api, login, finish, buyCoins, SEED } from './_lib.mjs';

// Live-API proof for the marketplace. The unit suites assert the rules against
// mocks; this asserts that a real purchase moves real coins through the real
// ledger, and that the guards hold against a running server rather than a fake.
//
// Every balance assertion is a DELTA on a specific user's account, derived from
// ledger entries. A global sum would pass while the coins moved on somebody
// else's account.

const balance = (type, userId) =>
  sql(
    `select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) ` +
      `from wallet_accounts wa join ledger_entries e on e.account_id=wa.id ` +
      `where wa.account_type='${type}' and wa.user_id='${userId}'`
  ).then(Number);

const platformRevenue = () =>
  sql(
    `select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) ` +
      `from wallet_accounts wa join ledger_entries e on e.account_id=wa.id ` +
      `where wa.account_type='PLATFORM_REVENUE'`
  ).then(Number);

const stamp = Date.now();
// Everything this run creates is stamped from here, so the integrity assertion
// below can be scoped to THIS run rather than to whatever a long-lived dev
// database happens to be carrying.
const runStartedAt = new Date().toISOString();

console.log('\n=== actors ===');
const VTOK = await login('viewer@afristage.local', SEED.viewer);
const CTOK = await login('creator@afristage.local', SEED.creator);
const ATOK = await login('admin@afristage.local', SEED.admin);
ok(!!(VTOK && CTOK && ATOK), 'seeded viewer/creator/admin login');

const viewerId = (await api('GET', '/users/me', { token: VTOK })).data?.id;
const creatorId = (await api('GET', '/users/me', { token: CTOK })).data?.id;
ok(!!(viewerId && creatorId), 'resolved viewer + creator ids');

console.log('\n=== a shop opens PENDING and cannot sell ===');
// The seeded creator may already own a shop from an earlier run; the API allows
// exactly one per account, so reuse it and reset it to PENDING for this pass.
let shop = (await api('GET', '/shops/me', { token: CTOK })).data;
if (!shop?.id) {
  const created = await api('POST', '/shops', { token: CTOK, body: { name: `Creator Shop ${stamp}` } });
  ok(created.status === 201 || created.status === 200, `create shop (status ${created.status})`);
  shop = created.data;
} else {
  await sql(`update shops set status='PENDING' where id='${shop.id}'`);
  ok(true, `reusing the creator's existing shop (${shop.id}), reset to PENDING`);
}
ok(!!shop?.id, `shop exists (${shop?.id})`);

const dupe = await api('POST', '/shops', { token: CTOK, body: { name: 'Second Shop' } });
ok(dupe.status === 400, `a second shop for the same owner is rejected (status ${dupe.status})`);

const statusNow = await sql(`select status from shops where id='${shop.id}'`);
ok(statusNow === 'PENDING', `shop is PENDING before review (got ${statusNow})`);

console.log('\n=== products ===');
const PRICE = 500;
const created = await api('POST', '/shops/me/products', {
  token: CTOK,
  body: { title: `Ankara Tee ${stamp}`, priceCoins: PRICE, stock: 3 }
});
ok(created.status === 201 || created.status === 200, `create product (status ${created.status})`);
const productId = created.data?.id;
ok(!!productId, `product created (${productId})`);
ok(created.data?.status === 'DRAFT', `a new product starts DRAFT (got ${created.data?.status})`);

const activated = await api('PATCH', `/shops/me/products/${productId}`, { token: CTOK, body: { status: 'ACTIVE' } });
ok(activated.status === 200, `set the product live (status ${activated.status})`);

console.log('\n=== an unapproved shop is invisible and unsellable ===');
const hiddenShop = await api('GET', `/shops/${shop.slug}`);
ok(hiddenShop.status === 404, `a PENDING shop 404s publicly, not 403 (status ${hiddenShop.status})`);

const earlyBuy = await api('POST', '/orders', {
  token: VTOK,
  body: { productId, quantity: 1, idempotencyKey: `early-${stamp}` }
});
ok(earlyBuy.status === 404, `buying from a PENDING shop is refused (status ${earlyBuy.status})`);

console.log('\n=== admin approval (audited) ===');
const approved = await api('PATCH', `/admin/shops/${shop.id}/status`, { token: ATOK, body: { status: 'APPROVED' } });
ok(approved.status === 200, `admin approves the shop (status ${approved.status})`);

const audit = await sql(
  `select count(*) from admin_audit_logs where action='shop.status_changed' and target='${shop.id}'`
);
ok(Number(audit) >= 1, `the approval is in the audit log (${audit} entries)`);

const asViewer = await api('GET', `/admin/shops/${shop.id}`, { token: VTOK });
ok(asViewer.status === 403, `a viewer cannot read the admin shop detail (status ${asViewer.status})`);

const viewerApprove = await api('PATCH', `/admin/shops/${shop.id}/status`, { token: VTOK, body: { status: 'SUSPENDED' } });
ok(viewerApprove.status === 403, `a viewer cannot change shop status (status ${viewerApprove.status})`);

console.log('\n=== pinning to a live room ===');
let rooms = (await api('GET', '/live-rooms')).data || [];
let roomId = rooms.find((r) => r.status === 'LIVE' && r.hostUserId === creatorId)?.id;
if (!roomId) {
  const cr = await api('POST', '/live-rooms', {
    token: CTOK,
    body: { title: `Shop Live ${stamp}`, category: 'MUSIC', country: 'NG', language: 'pidgin' }
  });
  roomId = cr.data?.id;
  await api('POST', `/live-rooms/${roomId}/start`, { token: CTOK });
}
ok(!!roomId, `live room hosted by the creator (${roomId})`);

const notHost = await api('POST', `/live-rooms/${roomId}/products`, { token: VTOK, body: { productId } });
ok(notHost.status === 403, `a non-host cannot pin to the room (status ${notHost.status})`);

const pinned = await api('POST', `/live-rooms/${roomId}/products`, { token: CTOK, body: { productId } });
ok(pinned.status === 201 || pinned.status === 200, `host pins the product (status ${pinned.status})`);

const pinnedTwice = await api('POST', `/live-rooms/${roomId}/products`, { token: CTOK, body: { productId } });
ok(pinnedTwice.status === 201 || pinnedTwice.status === 200, 'pinning twice is idempotent, not an error');
const openPins = await sql(
  `select count(*) from room_product_pins where room_id='${roomId}' and product_id='${productId}' and unpinned_at is null`
);
ok(Number(openPins) === 1, `pinning twice leaves ONE open pin (got ${openPins})`);

const shelf = await api('GET', `/live-rooms/${roomId}/products`);
ok(shelf.status === 200, `the shelf is public (status ${shelf.status})`);
ok(
  (shelf.data || []).some((p) => p.product?.id === productId),
  'the pinned product is on the public shelf'
);

console.log('\n=== the purchase moves real coins ===');
await buyCoins(VTOK, PRICE * 3);

const viewerBefore = await balance('COIN', viewerId);
const creatorBefore = await balance('EARNING', creatorId);
const platformBefore = await platformRevenue();

const orderKey = `order-${stamp}`;
const order = await api('POST', '/orders', {
  token: VTOK,
  body: { productId, quantity: 1, roomId, idempotencyKey: orderKey }
});
ok(order.status === 201 || order.status === 200, `viewer buys the product (status ${order.status})`);
const orderId = order.data?.id;
ok(!!orderId, `order created (${orderId})`);
ok(order.data?.roomId === roomId, 'the sale is attributed to the live room it was bought in');
ok(order.data?.totalCoins === PRICE, `order total is the listed price (${order.data?.totalCoins})`);

const sellerNet = order.data?.sellerNetCoins ?? 0;
const platformFee = order.data?.platformFeeCoins ?? 0;
ok(sellerNet + platformFee === PRICE, `seller net + platform fee equals what the buyer paid (${sellerNet} + ${platformFee})`);

const viewerAfter = await balance('COIN', viewerId);
const creatorAfter = await balance('EARNING', creatorId);
const platformAfter = await platformRevenue();

ok(viewerBefore - viewerAfter === PRICE, `the BUYER's coin balance fell by exactly ${PRICE} (delta ${viewerBefore - viewerAfter})`);
ok(creatorAfter - creatorBefore === sellerNet, `the SELLER's earnings rose by exactly ${sellerNet} (delta ${creatorAfter - creatorBefore})`);
ok(platformAfter - platformBefore === platformFee, `platform revenue rose by exactly ${platformFee} (delta ${platformAfter - platformBefore})`);

const ledgerType = await sql(
  `select t.type from ledger_transactions t join orders o on o.ledger_transaction_id=t.id where o.id='${orderId}'`
);
ok(ledgerType === 'PURCHASE', `the order projects a PURCHASE ledger transaction (got ${ledgerType})`);

console.log('\n=== stock ===');
const stockAfter = await sql(`select stock from products where id='${productId}'`);
ok(Number(stockAfter) === 2, `stock fell by exactly one unit, 3 -> ${stockAfter}`);

console.log('\n=== a replayed submit charges once AND consumes one unit ===');
const replay = await api('POST', '/orders', {
  token: VTOK,
  body: { productId, quantity: 1, roomId, idempotencyKey: orderKey }
});
ok(replay.status === 201 || replay.status === 200, `the replay is accepted (status ${replay.status})`);
ok(replay.data?.id === orderId, 'the replay returns the ORIGINAL order, not a new one');

const orderRows = await sql(`select count(*) from orders where buyer_user_id='${viewerId}' and product_id='${productId}'`);
ok(Number(orderRows) === 1, `one order row exists for this purchase (got ${orderRows})`);

const stockAfterReplay = await sql(`select stock from products where id='${productId}'`);
ok(Number(stockAfterReplay) === 2, `the replay did NOT consume a second unit (still ${stockAfterReplay})`);

const viewerAfterReplay = await balance('COIN', viewerId);
ok(viewerAfterReplay === viewerAfter, `the replay did NOT charge again (balance unchanged at ${viewerAfterReplay})`);

console.log('\n=== the guards, against a running server ===');
const selfBuy = await api('POST', '/orders', {
  token: CTOK,
  body: { productId, quantity: 1, idempotencyKey: `self-${stamp}` }
});
ok(selfBuy.status === 400, `a seller cannot buy from their own shop (status ${selfBuy.status})`);

const overStock = await api('POST', '/orders', {
  token: VTOK,
  body: { productId, quantity: 99, idempotencyKey: `over-${stamp}` }
});
ok(overStock.status === 400, `an order beyond available stock is refused (status ${overStock.status})`);
const stockAfterFail = await sql(`select stock from products where id='${productId}'`);
ok(Number(stockAfterFail) === 2, `the refused order left stock untouched (still ${stockAfterFail})`);

// A failed charge must not silently eat inventory. Drain the buyer, then try.
const poorEmail = `broke_${stamp}@test.local`;
await api('POST', '/auth/register', {
  body: {
    email: poorEmail, password: 'Test1234!', username: `b${stamp}`, displayName: 'Broke Buyer',
    country: 'NG', language: 'pidgin', ageConfirmed: true
  }
});
const POORTOK = await login(poorEmail, 'Test1234!');
const brokeBuy = await api('POST', '/orders', {
  token: POORTOK,
  body: { productId, quantity: 1, idempotencyKey: `broke-${stamp}` }
});
ok(brokeBuy.status === 400, `a buyer with no coins is refused (status ${brokeBuy.status})`);
const stockAfterBroke = await sql(`select stock from products where id='${productId}'`);
ok(Number(stockAfterBroke) === 2, `the failed charge RELEASED its stock reservation (still ${stockAfterBroke})`);

console.log('\n=== suspending a shop pulls it off every shelf ===');
await api('PATCH', `/admin/shops/${shop.id}/status`, { token: ATOK, body: { status: 'SUSPENDED' } });
const shelfSuspended = await api('GET', `/live-rooms/${roomId}/products`);
ok(
  !(shelfSuspended.data || []).some((p) => p.product?.id === productId),
  'a suspended shop disappears from the live-room shelf immediately'
);
const buyWhileSuspended = await api('POST', '/orders', {
  token: VTOK,
  body: { productId, quantity: 1, idempotencyKey: `susp-${stamp}` }
});
ok(buyWhileSuspended.status === 404, `buying from a suspended shop is refused (status ${buyWhileSuspended.status})`);
await api('PATCH', `/admin/shops/${shop.id}/status`, { token: ATOK, body: { status: 'APPROVED' } });

console.log('\n=== cross-user isolation ===');
const otherOrders = await api('GET', '/orders/me', { token: CTOK });
ok(otherOrders.status === 200, 'the seller can read their own order list');
ok(
  !(otherOrders.data || []).some((o) => o.id === orderId),
  "the buyer's order does NOT appear in another user's /orders/me"
);
const myOrders = await api('GET', '/orders/me', { token: VTOK });
ok((myOrders.data || []).some((o) => o.id === orderId), 'the buyer DOES see their own order (the positive twin)');

const shopOrders = await api('GET', '/shops/me/orders', { token: CTOK });
ok((shopOrders.data || []).some((o) => o.id === orderId), 'the seller sees the sale in their shop orders');

console.log('\n=== fulfilment ===');
const notMine = await api('PATCH', `/shops/me/orders/${orderId}/fulfil`, { token: VTOK });
ok(notMine.status === 404, `a buyer cannot fulfil the order they placed (status ${notMine.status})`);
const fulfilled = await api('PATCH', `/shops/me/orders/${orderId}/fulfil`, { token: CTOK });
ok(fulfilled.status === 200 && fulfilled.data?.status === 'FULFILLED', `the seller fulfils it (${fulfilled.data?.status})`);
const refulfil = await api('PATCH', `/shops/me/orders/${orderId}/fulfil`, { token: CTOK });
ok(refulfil.status === 400, `fulfilling twice is refused (status ${refulfil.status})`);

console.log('\n=== unpin is a soft close, so attribution survives ===');
const unpinned = await api('DELETE', `/live-rooms/${roomId}/products/${productId}`, { token: CTOK });
ok(unpinned.status === 200, `host unpins the product (status ${unpinned.status})`);
const closedPin = await sql(
  `select count(*) from room_product_pins where room_id='${roomId}' and product_id='${productId}' and unpinned_at is not null`
);
ok(Number(closedPin) >= 1, 'the pin row is closed with a timestamp, not deleted');
const attributed = await sql(`select room_id from orders where id='${orderId}'`);
ok(attributed === roomId, 'the sale is STILL attributed to the room after unpinning');

console.log('\n=== ledger integrity after every move ===');
const unbalancedSince = (since) =>
  sql(
    `select count(*) from (select t.id from ledger_transactions t join ledger_entries e on e.transaction_id=t.id ` +
      (since ? `where t.created_at >= '${since}' ` : '') +
      `group by t.id having sum(case when e.direction='DEBIT' then e.amount_minor else -e.amount_minor end) <> 0) x`
  );

// Scoped to this run: an assertion on the whole table would inherit whatever a
// long-lived dev database is already carrying, and would then be reporting
// somebody else's history rather than this feature's correctness.
const unbalancedThisRun = await unbalancedSince(runStartedAt);
ok(Number(unbalancedThisRun) === 0, `every transaction THIS RUN created balances (${unbalancedThisRun} unbalanced)`);

// The transactions this run created must include the purchase, or the check above
// passed vacuously by asserting over an empty set.
const postedThisRun = await sql(
  `select count(*) from ledger_transactions where created_at >= '${runStartedAt}' and type='PURCHASE'`
);
ok(Number(postedThisRun) >= 1, `the scoped check saw the PURCHASE it is meant to verify (${postedThisRun})`);

// Whole-table integrity is reported, not asserted, for the same reason. A
// non-zero count here is real and worth chasing — it is just not this suite's
// verdict to give.
const unbalancedTotal = await unbalancedSince(null);
console.log(
  Number(unbalancedTotal) === 0
    ? '  INFO  whole-table ledger integrity is clean'
    : `  INFO  ${unbalancedTotal} pre-existing unbalanced transaction(s) in this database, created before this run — investigate separately`
);

console.log('\n=== teardown ===');
await api('PATCH', `/shops/me/products/${productId}`, { token: CTOK, body: { status: 'ARCHIVED' } });
ok(true, 'test product archived');

await finish();
