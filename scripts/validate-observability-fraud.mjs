import { ok, sql, api as raw, login, finish } from './_lib.mjs';

console.log('\n=== OBSERVABILITY ===');
const live = await raw('GET', '/health');
ok(live.status === 200 && live.data?.status === 'ok', 'liveness /health -> 200 ok');
const ready = await raw('GET', '/health/ready');
ok(ready.status === 200 && ready.data?.checks?.db && ready.data?.checks?.redis, 'readiness /health/ready -> db+redis up');
ok(!!live.headers.get('x-request-id'), 'response carries x-request-id correlation header');
const echo = await raw('GET', '/health', { headers: { 'x-request-id': 'my-trace-123' } });
ok(echo.headers.get('x-request-id') === 'my-trace-123', 'incoming x-request-id is propagated');

console.log('\n=== PAYOUT FRAUD HOLD ===');
const VTOK = await login('viewer@afristage.local', 'Viewer123!');
const CTOK = await login('creator@afristage.local', 'Creator123!');
const ATOK = await login('admin@afristage.local', 'Admin123!');
const stamp = Date.now();

// mint creator earnings: clear rooms, start one, buy + gift 2,000,000 coins
await raw('POST', '/admin/live-rooms/end-stale', { token: ATOK, body: { maxIdleMinutes: 0 } });
const room = await raw('POST', '/live-rooms', { token: CTOK, body: { title: 'Fraud Test', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
await raw('POST', `/live-rooms/${room.data.id}/start`, { token: CTOK });
const intent = await raw('POST', '/payments/coin-purchase-intents', { token: VTOK, body: { amountMinor: 200000000, currency: 'NGN', coinAmount: 2000000 } });
await raw('POST', `/payments/mock/${intent.data.id}/complete`, { token: VTOK });
const gift = (await raw('GET', '/gifts')).data[0];
await raw('POST', `/live-rooms/${room.data.id}/gifts`, { token: VTOK, body: { giftId: gift.id, quantity: 200000, idempotencyKey: `fraud-gift-${stamp}` } });

// control: small payout from the (new) seeded creator is NOT held
const small = await raw('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 600, idempotencyKey: `fraud-small-${stamp}` } });
ok(small.data?.status === 'UNDER_REVIEW', `small payout from new creator -> UNDER_REVIEW (not held) (${small.data?.status})`);

// large payout from a new creator IS held
const large = await raw('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 1000000, idempotencyKey: `fraud-large-${stamp}` } });
ok(large.data?.status === 'HELD', `large payout from new creator -> HELD (${large.data?.status})`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.held' and target='${large.data.id}'`) === '1', 'fraud hold wrote payout.held audit log');

// HELD cannot be approved directly
const approveHeld = await raw('POST', `/admin/payouts/${large.data.id}/approve`, { token: ATOK });
ok(approveHeld.status === 409, `HELD payout cannot be approved directly (status ${approveHeld.status})`);

// release moves it back to review, then approve works
const release = await raw('POST', `/admin/payouts/${large.data.id}/release`, { token: ATOK });
ok(release.data?.status === 'UNDER_REVIEW', `release HELD -> UNDER_REVIEW (${release.data?.status})`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.released' and target='${large.data.id}'`) === '1', 'release wrote payout.released audit log');
const approve = await raw('POST', `/admin/payouts/${large.data.id}/approve`, { token: ATOK });
ok(approve.data?.status === 'APPROVED', `released payout can then be approved (${approve.data?.status})`);

console.log('\n=== LEDGER INTEGRITY ===');
const integ = await raw('GET', '/admin/ledger/integrity', { token: ATOK });
ok(integ.data?.ok === true && integ.data?.unbalancedTransactions === 0, 'ledger balanced after fraud flow');

await finish();
