import { io } from 'socket.io-client';
import { ok, sql, api, login, finish, WS } from './_lib.mjs';

process.on('unhandledRejection', () => {}); // ignore socket teardown ack noise in this harness

console.log('\n=== AUTH: registration (fresh users, not seed) ===');
const stamp = Date.now();
const vEmail = `viewer_${stamp}@test.local`;
const reg = await api('POST', '/auth/register', {
  body: { email: vEmail, password: 'Test1234!', username: `v${stamp}`, displayName: 'Fresh Viewer', country: 'NG', language: 'pidgin', ageConfirmed: true }
});
ok(reg.status === 201 || reg.status === 200, `register fresh viewer (status ${reg.status})`);
ok(!!reg.data?.accessToken, 'register returns access token');
const newViewerTok = await login(vEmail, 'Test1234!');
ok(!!newViewerTok, 'fresh viewer can log in');
const wrong = await api('POST', '/auth/login', { body: { identifier: vEmail, password: 'WRONG' } });
ok(wrong.status === 401, `wrong password rejected (status ${wrong.status})`);
const me = await api('GET', '/users/me', { token: newViewerTok });
ok(me.status === 200 && me.data?.id, 'JWT protects /users/me and returns profile');
const noAuth = await api('GET', '/users/me');
ok(noAuth.status === 401, `/users/me without token rejected (status ${noAuth.status})`);

console.log('\n=== seeded actors for money legs ===');
const VTOK = await login('viewer@afristage.local', 'Viewer123!');
const CTOK = await login('creator@afristage.local', 'Creator123!');
const ATOK = await login('admin@afristage.local', 'Admin123!');
ok(VTOK && CTOK && ATOK, 'seeded viewer/creator/admin login');

// reuse existing LIVE room or create one
let rooms = (await api('GET', '/live-rooms')).data || [];
let roomId = rooms.find((r) => r.status === 'LIVE')?.id;
if (!roomId) {
  const cr = await api('POST', '/live-rooms', { token: CTOK, body: { title: 'Phase2 Live', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
  roomId = cr.data?.id;
  await api('POST', `/live-rooms/${roomId}/start`, { token: CTOK });
}
ok(!!roomId, `live room available (${roomId})`);

console.log('\n=== CHAT over WebSocket ===');
await new Promise((resolve) => {
  const creatorSock = io(WS, { auth: { token: CTOK }, transports: ['websocket'] });
  const viewerSock = io(WS, { auth: { token: VTOK }, transports: ['websocket'] });
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    setTimeout(() => { try { creatorSock.close(); } catch {} try { viewerSock.close(); } catch {} resolve(); }, 300);
  };
  const timeout = setTimeout(() => { ok(false, 'chat.message_created received by other client (TIMEOUT)'); finish(); }, 6000);

  let bothConnected = 0;
  const onConnect = () => { if (++bothConnected === 2) start(); };
  creatorSock.on('connect', onConnect);
  viewerSock.on('connect', onConnect);
  creatorSock.on('connect_error', (e) => { ok(false, `creator WS connect_error: ${e.message}`); clearTimeout(timeout); finish(); });

  creatorSock.on('chat.message_created', (msg) => {
    ok(msg?.message === 'Big tune 🔥', `creator received viewer's chat message ("${msg?.message}")`);
    clearTimeout(timeout);
    finish();
  });

  async function start() {
    ok(true, 'both clients authenticated + connected to /chat');
    await creatorSock.emitWithAck('room.join', { roomId });
    await viewerSock.emitWithAck('room.join', { roomId });
    const res = await viewerSock.emitWithAck('chat.message', { roomId, message: 'Big tune 🔥', clientMessageId: 'c1' });
    ok(res?.ok === true && !!res.messageId, 'viewer chat.message acked + persisted');
  }
});
// unauthenticated WS must be disconnected
await new Promise((resolve) => {
  const bad = io(WS, { auth: { token: 'garbage' }, transports: ['websocket'] });
  const t = setTimeout(() => { ok(false, 'bad-token WS disconnect (timeout)'); bad.close(); resolve(); }, 4000);
  bad.on('disconnect', () => { ok(true, 'WS with invalid token is disconnected'); clearTimeout(t); bad.close(); resolve(); });
  bad.on('connect_error', () => { ok(true, 'WS with invalid token rejected'); clearTimeout(t); bad.close(); resolve(); });
});

console.log('\n=== GIFT + EARNINGS (earn enough to clear 500k payout min) ===');
// buy 2,000,000 coins
const intent = await api('POST', '/payments/coin-purchase-intents', { token: VTOK, body: { amountMinor: 200000000, currency: 'NGN', coinAmount: 2000000 } });
await api('POST', `/payments/mock/${intent.data.id}/complete`, { token: VTOK });
const gifts = (await api('GET', '/gifts')).data;
const gift = gifts[0]; // 10-coin gift
const earnBefore = BigInt(await sql("select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='EARNING'"));
const sent = await api('POST', `/live-rooms/${roomId}/gifts`, { token: VTOK, body: { giftId: gift.id, quantity: 200000, idempotencyKey: `p2-biggift-${stamp}` } });
ok(sent.status === 200 || sent.status === 201, `send 200000x 10-coin gift = 2,000,000 coins (status ${sent.status})`);
ok(sent.data?.creatorEarningMinor === '1200000', `creator earning = 1,200,000 (got ${sent.data?.creatorEarningMinor})`);
ok(sent.data?.platformFeeMinor === '800000', `platform fee = 800,000 (got ${sent.data?.platformFeeMinor})`);
// insufficient balance: huge gift the viewer can't afford
const broke = await api('POST', `/live-rooms/${roomId}/gifts`, { token: VTOK, body: { giftId: gift.id, quantity: 999999999, idempotencyKey: `p2-broke-${stamp}` } });
ok(broke.status >= 400, `gift beyond balance rejected (status ${broke.status})`);
// creator cannot gift their own room
const selfGift = await api('POST', `/live-rooms/${roomId}/gifts`, { token: CTOK, body: { giftId: gift.id, quantity: 1, idempotencyKey: `p2-self-${stamp}` } });
ok(selfGift.status === 400, `creator cannot gift themselves (status ${selfGift.status})`);

console.log('\n=== PAYOUTS: currency model, idempotency, state guards ===');
const HOLD_SQL = "select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='PAYOUT_HOLD'";
const EARN_SQL = "select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='EARNING'";

const belowMin = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 100, idempotencyKey: `p2-below-${stamp}` } });
ok(belowMin.status >= 400, `payout below min coin threshold rejected (status ${belowMin.status})`);

const keyA = `p2-A-${stamp}`;
const holdBeforeA = BigInt(await sql(HOLD_SQL)); // hold is shared/accumulating — assert the delta
const reqA = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 500000, idempotencyKey: keyA } });
ok(reqA.data?.status === 'UNDER_REVIEW', `payout A -> UNDER_REVIEW (${reqA.data?.status})`);
ok(reqA.data?.fiatCurrency === 'NGN' && reqA.data?.fiatMinor === '50000000', `explicit coin->fiat: 500000 coins = ${reqA.data?.fiatMinor} ${reqA.data?.fiatCurrency} minor`);
ok(BigInt(await sql(HOLD_SQL)) - holdBeforeA === 500000n, `funds moved EARNING->HOLD (+500000 coins)`);

// idempotency: same key returns same payout, no second hold transfer
const holdBeforeReplay = await sql(HOLD_SQL);
const reqAdup = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 500000, idempotencyKey: keyA } });
ok(reqAdup.data?.id === reqA.data.id, 'duplicate idempotencyKey returns the same payout');
ok(await sql(HOLD_SQL) === holdBeforeReplay, 'duplicate payout request does not double-move funds to hold');

const approveA = await api('POST', `/admin/payouts/${reqA.data.id}/approve`, { token: ATOK });
ok(approveA.data?.status === 'APPROVED', `admin approved A (${approveA.data?.status})`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.approved' and target='${reqA.data.id}'`) === '1', 'approve wrote admin audit log');
const clearingSql = "select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='PAYOUT_CLEARING'";
const clearingBefore = BigInt(await sql(clearingSql)); // system account accumulates across runs — assert the delta
const paidA = await api('POST', `/admin/payouts/${reqA.data.id}/mark-paid`, { token: ATOK });
ok(paidA.data?.status === 'PAID', `admin marked A PAID (${paidA.data?.status})`);
ok(BigInt(await sql(clearingSql)) - clearingBefore === 500000n, `paid funds moved HOLD->PAYOUT_CLEARING`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.paid' and target='${reqA.data.id}'`) === '1', 'mark-paid wrote admin audit log');

// state guards: PAID is terminal
const payTwice = await api('POST', `/admin/payouts/${reqA.data.id}/mark-paid`, { token: ATOK });
ok(payTwice.status === 409, `paid payout cannot be marked paid twice (status ${payTwice.status})`);
const rejectPaid = await api('POST', `/admin/payouts/${reqA.data.id}/reject`, { token: ATOK, body: { reason: 'x' } });
ok(rejectPaid.status === 409, `paid payout cannot be rejected (status ${rejectPaid.status})`);

const reqB = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 500000, idempotencyKey: `p2-B-${stamp}` } });
ok(reqB.data?.status === 'UNDER_REVIEW', `payout B requested (${reqB.data?.status})`);
const earnBeforeReject = await sql(EARN_SQL);
const rejectB = await api('POST', `/admin/payouts/${reqB.data.id}/reject`, { token: ATOK, body: { reason: 'fraud check' } });
ok(rejectB.data?.status === 'REJECTED', `admin rejected B (${rejectB.data?.status})`);
ok(BigInt(await sql(EARN_SQL)) - BigInt(earnBeforeReject) === 500000n, `rejected payout B returned funds to EARNING`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.rejected' and target='${reqB.data.id}'`) === '1', 'reject wrote admin audit log');

console.log('\n=== LEDGER INTEGRITY (after everything) ===');
const d = await sql("select coalesce(sum(amount_minor),0) from ledger_entries where direction='DEBIT'");
const c = await sql("select coalesce(sum(amount_minor),0) from ledger_entries where direction='CREDIT'");
ok(d === c, `global debits == credits (${d} == ${c})`);
const unbal = await sql("select count(*) from (select t.id from ledger_transactions t join ledger_entries e on e.transaction_id=t.id group by t.id having sum(case when e.direction='DEBIT' then e.amount_minor else 0 end) <> sum(case when e.direction='CREDIT' then e.amount_minor else 0 end)) x");
ok(unbal === '0', `every transaction balances (${unbal} unbalanced)`);

await finish();
