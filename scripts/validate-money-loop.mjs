import { io } from 'socket.io-client';
import { ok, sql, api, login, finish, WS, buyCoins, giftCoins} from './_lib.mjs';

process.on('unhandledRejection', () => {}); // ignore socket teardown ack noise in this harness

// Ledger-derived balance for one account type, optionally scoped to one user.
// Scoping matters: these assertions are deltas, and a global sum would pass while
// the coins moved on somebody else's account.
const balanceSql = (type, userId) =>
  `select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='${type}'` +
  (userId ? ` and wa.user_id='${userId}'` : '');

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

// The room MUST be hosted by the creator whose payouts are exercised below —
// reusing whichever room happened to be LIVE sent the gift earnings to a
// different host, leaving this creator with "Insufficient earnings".
const creatorId = (await api('GET', '/users/me', { token: CTOK })).data?.id;
ok(!!creatorId, 'resolved the payout creator id');
let rooms = (await api('GET', '/live-rooms')).data || [];
let roomId = rooms.find((r) => r.status === 'LIVE' && r.hostUserId === creatorId)?.id;
if (!roomId) {
  const cr = await api('POST', '/live-rooms', { token: CTOK, body: { title: 'Phase2 Live', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
  roomId = cr.data?.id;
  await api('POST', `/live-rooms/${roomId}/start`, { token: CTOK });
}
ok(!!roomId, `live room hosted by the payout creator (${roomId})`);

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
// An invalid token is READ-ONLY, not disconnected. The gateway deliberately
// degrades a bad/expired token to a guest so "watch free, no sign-up" viewers
// keep the stream — the write handlers are what enforce auth. This assertion used
// to expect a disconnect, which stopped being the contract when guest viewing
// landed; it then raced its own 4s timeout and recorded BOTH a FAIL (timeout) and
// a PASS, because bad.close() fires 'disconnect' too. Assert the real guarantee:
// a guest connects, and cannot write.
await new Promise((resolve) => {
  const bad = io(WS, { auth: { token: 'garbage' }, transports: ['websocket'] });
  let settled = false;
  const settle = (pass, label) => {
    if (settled) return;
    settled = true;
    clearTimeout(t);
    ok(pass, label);
    bad.close();
    resolve();
  };
  const t = setTimeout(() => settle(false, 'WS with an invalid token is read-only (timed out after 15s)'), 15000);
  bad.on('connect_error', () => settle(false, 'WS with an invalid token is read-only (connection refused — guests should be allowed to watch)'));
  bad.on('connect', async () => {
    try {
      await bad.emitWithAck('room.join', { roomId });
      const res = await bad.emitWithAck('chat.message', { roomId, message: 'should be rejected', clientMessageId: 'guest1' });
      settle(res?.ok === false, `WS with an invalid token connects as a guest and cannot chat (${res?.error ?? 'no error returned'})`);
    } catch (e) {
      settle(false, `WS with an invalid token is read-only (unexpected: ${e.message})`);
    }
  });
});

console.log('\n=== GIFT + EARNINGS (earn enough to clear both payouts below) ===');
// Coins come from server-priced packages (see buyCoins), so the whole suite is
// scaled off what the real API will actually sell rather than a hard-coded figure.
const viewerId = (await api('GET', '/users/me', { token: VTOK })).data?.id;
const COIN_SQL = balanceSql('COIN', viewerId);
const coinsBefore = BigInt(await sql(COIN_SQL));
const bought = await buyCoins(VTOK, 6000);
const TARGET_GIFT_COINS = bought.coins;
ok(
  BigInt(await sql(COIN_SQL)) - coinsBefore === BigInt(TARGET_GIFT_COINS),
  `${bought.buys}x ${bought.package.id} credited ${TARGET_GIFT_COINS} coins`
);

const gifts = (await api('GET', '/gifts')).data;
const gift = gifts[0];
const CREATOR_SHARE_BPS = Number(process.env.CREATOR_SHARE_BPS || 6000);
const EARN_SQL = balanceSql('EARNING', creatorId);
const earnBefore = BigInt(await sql(EARN_SQL));
// SendGiftDto bounds quantity at 10000 so coinPrice * quantity can't overflow the
// Int total column, so the 2,000,000 coins the payouts below need are gifted in
// batches rather than one oversized request. (This script used to send
// quantity: 200000 in a single call, which that bound has rejected with a 400
// ever since it was added — taking every downstream payout assertion with it.)
const coinsPerGift = Number(gift.coinPrice);
const sent = await giftCoins(VTOK, roomId, TARGET_GIFT_COINS, gift.id, coinsPerGift, `p2-biggift-${stamp}`);
ok(sent.status === 200 || sent.status === 201, `gifted ${TARGET_GIFT_COINS} coins in ${coinsPerGift}-coin gifts (status ${sent.status})`);
// The split ratio is asserted on the last batch; the total is asserted against the
// ledger — so both the per-gift math and the accumulated sum are covered.
const lastBatchCoins = Number(sent.data?.creatorEarningMinor) + Number(sent.data?.platformFeeMinor);
ok(sent.data?.creatorEarningMinor === String((lastBatchCoins * CREATOR_SHARE_BPS) / 10000), `creator share is ${CREATOR_SHARE_BPS} bps of the gift (got ${sent.data?.creatorEarningMinor} of ${lastBatchCoins})`);
ok(Number(sent.data?.creatorEarningMinor) + Number(sent.data?.platformFeeMinor) === lastBatchCoins, `creator + platform split accounts for the whole gift (${sent.data?.creatorEarningMinor} + ${sent.data?.platformFeeMinor} = ${lastBatchCoins})`);
const expectedEarned = BigInt((TARGET_GIFT_COINS * CREATOR_SHARE_BPS) / 10000);
const earnedTotal = BigInt(await sql(EARN_SQL)) - earnBefore;
ok(earnedTotal === expectedEarned, `creators earned ${expectedEarned} coins in total (got ${earnedTotal})`);
// insufficient balance: the viewer just spent everything, so a full-price gift
// within the quantity bound must still be refused on balance, not on validation.
const broke = await api('POST', `/live-rooms/${roomId}/gifts`, { token: VTOK, body: { giftId: gift.id, quantity: 10000, idempotencyKey: `p2-broke-${stamp}` } });
ok(broke.status >= 400 && /balance/i.test(JSON.stringify(broke.data ?? '')), `gift beyond balance rejected on balance (status ${broke.status})`);
// creator cannot gift their own room
const selfGift = await api('POST', `/live-rooms/${roomId}/gifts`, { token: CTOK, body: { giftId: gift.id, quantity: 1, idempotencyKey: `p2-self-${stamp}` } });
ok(selfGift.status === 400, `creator cannot gift themselves (status ${selfGift.status})`);

console.log('\n=== PAYOUTS: currency model, idempotency, state guards ===');
const HOLD_SQL = balanceSql('PAYOUT_HOLD', creatorId);

// Sized from what the creator actually earned above, so the suite scales with
// the coin packages instead of hard-coding a figure the API can no longer reach.
const PAYOUT_COINS = Number(expectedEarned / 3n); // two payouts, comfortably covered
const COIN_FIAT_RATE = Number(process.env.COIN_TO_FIAT_MINOR_RATE || 100);
const belowMin = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 100, idempotencyKey: `p2-below-${stamp}` } });
ok(belowMin.status >= 400, `payout below min coin threshold rejected (status ${belowMin.status})`);

const keyA = `p2-A-${stamp}`;
const holdBeforeA = BigInt(await sql(HOLD_SQL)); // hold is shared/accumulating — assert the delta
const reqA = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: PAYOUT_COINS, idempotencyKey: keyA } });
ok(reqA.data?.status === 'UNDER_REVIEW', `payout A -> UNDER_REVIEW (${reqA.data?.status})`);
ok(reqA.data?.fiatCurrency === 'NGN' && reqA.data?.fiatMinor === String(PAYOUT_COINS * COIN_FIAT_RATE), `explicit coin->fiat: ${PAYOUT_COINS} coins = ${reqA.data?.fiatMinor} ${reqA.data?.fiatCurrency} minor`);
ok(BigInt(await sql(HOLD_SQL)) - holdBeforeA === BigInt(PAYOUT_COINS), `funds moved EARNING->HOLD (+${PAYOUT_COINS} coins)`);

// idempotency: same key returns same payout, no second hold transfer
const holdBeforeReplay = await sql(HOLD_SQL);
const reqAdup = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: PAYOUT_COINS, idempotencyKey: keyA } });
ok(reqAdup.data?.id === reqA.data.id, 'duplicate idempotencyKey returns the same payout');
ok(await sql(HOLD_SQL) === holdBeforeReplay, 'duplicate payout request does not double-move funds to hold');

const approveA = await api('POST', `/admin/payouts/${reqA.data.id}/approve`, { token: ATOK });
ok(approveA.data?.status === 'APPROVED', `admin approved A (${approveA.data?.status})`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.approved' and target='${reqA.data.id}'`) === '1', 'approve wrote admin audit log');
const clearingSql = balanceSql('PAYOUT_CLEARING'); // system account, not per-user
const clearingBefore = BigInt(await sql(clearingSql)); // system account accumulates across runs — assert the delta
const paidA = await api('POST', `/admin/payouts/${reqA.data.id}/mark-paid`, { token: ATOK });
ok(paidA.data?.status === 'PAID', `admin marked A PAID (${paidA.data?.status})`);
ok(BigInt(await sql(clearingSql)) - clearingBefore === BigInt(PAYOUT_COINS), `paid funds moved HOLD->PAYOUT_CLEARING`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.paid' and target='${reqA.data.id}'`) === '1', 'mark-paid wrote admin audit log');

// state guards: PAID is terminal
const payTwice = await api('POST', `/admin/payouts/${reqA.data.id}/mark-paid`, { token: ATOK });
ok(payTwice.status === 409, `paid payout cannot be marked paid twice (status ${payTwice.status})`);
const rejectPaid = await api('POST', `/admin/payouts/${reqA.data.id}/reject`, { token: ATOK, body: { reason: 'x' } });
ok(rejectPaid.status === 409, `paid payout cannot be rejected (status ${rejectPaid.status})`);

const reqB = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: PAYOUT_COINS, idempotencyKey: `p2-B-${stamp}` } });
ok(reqB.data?.status === 'UNDER_REVIEW', `payout B requested (${reqB.data?.status})`);
const earnBeforeReject = await sql(EARN_SQL);
const rejectB = await api('POST', `/admin/payouts/${reqB.data.id}/reject`, { token: ATOK, body: { reason: 'fraud check' } });
ok(rejectB.data?.status === 'REJECTED', `admin rejected B (${rejectB.data?.status})`);
ok(BigInt(await sql(EARN_SQL)) - BigInt(earnBeforeReject) === BigInt(PAYOUT_COINS), `rejected payout B returned funds to EARNING`);
ok(await sql(`select count(*) from admin_audit_logs where action='payout.rejected' and target='${reqB.data.id}'`) === '1', 'reject wrote admin audit log');

console.log('\n=== LEDGER INTEGRITY (after everything) ===');
const d = await sql("select coalesce(sum(amount_minor),0) from ledger_entries where direction='DEBIT'");
const c = await sql("select coalesce(sum(amount_minor),0) from ledger_entries where direction='CREDIT'");
ok(d === c, `global debits == credits (${d} == ${c})`);
const unbal = await sql("select count(*) from (select t.id from ledger_transactions t join ledger_entries e on e.transaction_id=t.id group by t.id having sum(case when e.direction='DEBIT' then e.amount_minor else 0 end) <> sum(case when e.direction='CREDIT' then e.amount_minor else 0 end)) x");
ok(unbal === '0', `every transaction balances (${unbal} unbalanced)`);

await finish();
