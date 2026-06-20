// Closed-beta smoke test: drives the entire control loop in one run against a
// live stack — auth, beta invite, support, coins, live room + LiveKit token,
// realtime chat/reaction/history, gift + gift.sent broadcast + idempotency,
// payout lifecycle + double-pay guard, report + escalate, room.ended + join
// guard, ledger integrity, audit logs. Exits non-zero on the first failure.
import { io } from 'socket.io-client';
import { api, login, ok, sql, finish, B } from './_lib.mjs';

const ORIGIN = process.env.SOCKET_BASE || B.replace(/\/api\/?$/, '');
const stamp = Date.now();

const waitForEvent = (socket, event, timeoutMs = 6000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (p) => {
      clearTimeout(timer);
      resolve(p);
    });
  });
const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(`${ORIGIN}/chat`, { auth: { token }, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 6000);
    s.on('connect', () => { clearTimeout(timer); resolve(s); });
    s.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
const emit = (socket, event, body) => new Promise((resolve) => socket.emit(event, body, (ack) => resolve(ack)));
const register = async (tag) => {
  const r = await api('POST', '/auth/register', {
    body: { email: `${tag}_${stamp}@test.local`, password: 'Test1234!', username: `${tag}${stamp}`, displayName: tag, country: 'NG', language: 'pidgin', ageConfirmed: true }
  });
  return { token: r.data.accessToken, userId: r.data.userId };
};

async function main() {
  // 1. AUTH
  console.log('\n=== AUTH ===');
  const ATOK = await login('admin@afristage.local', 'Admin123!');
  const CTOK = await login('creator@afristage.local', 'Creator123!');
  const VTOK = await login('viewer@afristage.local', 'Viewer123!');
  ok(!!ATOK && !!CTOK && !!VTOK, 'admin + creator + viewer logged in');

  // 2. BETA INVITE
  console.log('\n=== BETA INVITE ===');
  const inv = await api('POST', '/admin/beta-invites', { token: ATOK, body: { email: `invitee_${stamp}@test.local`, type: 'VIEWER' } });
  ok(inv.status === 201 && !!inv.data?.code, 'admin creates invite, code returned once');
  const invitee = await register('invitee');
  const acc = await api('POST', '/beta/accept', { token: invitee.token, body: { code: inv.data.code } });
  ok(acc.status === 201 || acc.status === 200, `invitee accepts invite (${acc.status})`);
  const acc2 = await api('POST', '/beta/accept', { token: invitee.token, body: { code: inv.data.code } });
  ok(acc2.status >= 400, `invite cannot be accepted twice (${acc2.status})`);

  // 3. SUPPORT
  console.log('\n=== SUPPORT ===');
  const tkt = await api('POST', '/support/tickets', { token: VTOK, body: { type: 'PAYMENT', subject: 'Coins missing', description: 'bought coins, not showing' } });
  ok(tkt.status === 201 && !!tkt.data?.id, 'viewer opens support ticket');
  const mine = await api('GET', '/support/tickets/me', { token: VTOK });
  ok(Array.isArray(mine.data) && mine.data.some((t) => t.id === tkt.data.id), 'ticket appears in my tickets');

  // 4. COINS
  console.log('\n=== COINS ===');
  const intent = await api('POST', '/payments/coin-purchase-intents', { token: VTOK, body: { amountMinor: 200000000, currency: 'NGN', coinAmount: 2000000 } });
  const done = await api('POST', `/payments/mock/${intent.data.id}/complete`, { token: VTOK });
  ok(done.status === 201 || done.status === 200, `mock coin purchase completes (${done.status})`);
  const wallet = await api('GET', '/wallet/me', { token: VTOK });
  ok(BigInt(wallet.data?.coinBalance ?? '0') >= 2000000n, `wallet credited (balance ${wallet.data?.coinBalance})`);
  // Ownership guard: another user must not be able to complete this viewer's intent.
  const steal = await api('POST', `/payments/mock/${intent.data.id}/complete`, { token: CTOK });
  ok(steal.status === 403, `creator cannot complete a viewer's mock payment intent (${steal.status})`);

  // 5. CREATOR LIVE ROOM + LIVEKIT TOKEN
  console.log('\n=== LIVE ROOM ===');
  const host = await sql(`select u.id from users u join creator_profiles c on c.user_id=u.id where c.approval_status='APPROVED' limit 1`);
  await sql(`update live_rooms set status='ENDED', ended_at=now() where host_user_id='${host}' and status='LIVE'`);
  const created = await api('POST', '/live-rooms', { token: CTOK, body: { title: `SMOKE-${stamp}`, category: 'MUSIC', country: 'NG', language: 'pidgin' } });
  const roomId = created.data?.id;
  const started = await api('POST', `/live-rooms/${roomId}/start`, { token: CTOK });
  ok(started.status === 201 && started.data?.status === 'LIVE', `room started LIVE (${started.status})`);
  ok(!!started.data?.hostToken && !!started.data?.livekitUrl, 'start returns hostToken + livekitUrl');

  // 6-8. SOCKET JOIN + CHAT + REACTION + HISTORY
  console.log('\n=== REALTIME CHAT ===');
  const socket = await connect(VTOK);
  ok(socket.connected, 'viewer socket connected to /chat');
  const joinAck = await emit(socket, 'room.join', { roomId });
  ok(joinAck?.ok === true, 'viewer joined the room');
  const msgP = waitForEvent(socket, 'chat.message_created');
  await emit(socket, 'chat.message', { roomId, message: 'hello beta', clientMessageId: `c-${stamp}` });
  const msg = await msgP;
  ok(!!msg, 'chat.message_created broadcast received');
  const reactP = waitForEvent(socket, 'reaction.sent');
  await emit(socket, 'reaction.sent', { roomId, reactionType: 'HEART' });
  ok(!!(await reactP), 'reaction.sent broadcast received');
  const history = await api('GET', `/live-rooms/${roomId}/messages?limit=50`, { token: VTOK });
  ok(Array.isArray(history.data) && history.data.some((m) => m.message === 'hello beta'), 'chat history includes the sent message');

  // 9. GIFT + BROADCAST + IDEMPOTENCY
  console.log('\n=== GIFT ===');
  const gift = (await api('GET', '/gifts')).data[0];
  const giftP = waitForEvent(socket, 'gift.sent');
  const giftKey = `smoke-gift-${stamp}`;
  const sent = await api('POST', `/live-rooms/${roomId}/gifts`, { token: VTOK, body: { giftId: gift.id, quantity: 200000, idempotencyKey: giftKey } });
  ok(sent.status === 201, `gift sent (${sent.status})`);
  ok(!!(await giftP), 'gift.sent broadcast received');
  const dup = await api('POST', `/live-rooms/${roomId}/gifts`, { token: VTOK, body: { giftId: gift.id, quantity: 200000, idempotencyKey: giftKey } });
  ok(dup.data?.id === sent.data.id, 'duplicate gift idempotencyKey returns the same transaction');

  // 9b. TOP-GIFTERS LEADERBOARD (sole gifter in this fresh room tops the board)
  const board = await api('GET', `/live-rooms/${roomId}/top-gifters`);
  ok(Array.isArray(board.data) && board.data.length >= 1, `leaderboard returns gifters (${board.data?.length})`);
  ok(board.data[0]?.rank === 1 && board.data[0]?.totalCoins === 2000000, `top gifter ranked with correct coins (${board.data?.[0]?.totalCoins})`);

  // 10. PAYOUT LIFECYCLE
  console.log('\n=== PAYOUT ===');
  const payKey = `smoke-payout-${stamp}`;
  const req = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 500000, idempotencyKey: payKey } });
  ok(req.data?.status === 'UNDER_REVIEW', `payout requested UNDER_REVIEW (${req.data?.status})`);
  const reqDup = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 500000, idempotencyKey: payKey } });
  ok(reqDup.data?.id === req.data.id, 'duplicate payout idempotencyKey returns the same payout');
  const approve = await api('POST', `/admin/payouts/${req.data.id}/approve`, { token: ATOK });
  ok(approve.data?.status === 'APPROVED', `admin approved payout (${approve.data?.status})`);
  const paid = await api('POST', `/admin/payouts/${req.data.id}/mark-paid`, { token: ATOK });
  ok(paid.data?.status === 'PAID', `admin marked paid (${paid.data?.status})`);
  const payTwice = await api('POST', `/admin/payouts/${req.data.id}/mark-paid`, { token: ATOK });
  ok(payTwice.status === 409, `paid payout cannot be paid twice (${payTwice.status})`);

  // 11. REPORT + ESCALATE
  console.log('\n=== REPORT ===');
  const rep = await api('POST', '/reports', { token: VTOK, body: { targetUserId: host, roomId, reason: 'SPAM', details: 'smoke', priority: 'MEDIUM' } });
  ok(rep.status === 201 && !!rep.data?.id, 'report created');
  const esc = await api('POST', `/admin/reports/${rep.data.id}/action`, { token: ATOK, body: { action: 'ESCALATE' } });
  ok(esc.data?.priority === 'CRITICAL' && esc.data?.status === 'REVIEWING', `escalate -> CRITICAL/REVIEWING (${esc.data?.priority}/${esc.data?.status})`);

  // 11b. FRAUD ASSESSMENT (admin-only, explainable)
  console.log('\n=== FRAUD ===');
  const fraud = await api('GET', `/admin/fraud/creators/${host}`, { token: ATOK });
  const ACTIONS = ['NONE', 'SOFT_FLAG', 'MANUAL_REVIEW', 'PAYOUT_HOLD'];
  ok(fraud.status === 200 && Array.isArray(fraud.data?.signals), `fraud assessment returns signals (${fraud.status})`);
  ok(typeof fraud.data?.riskScore === 'number' && ACTIONS.includes(fraud.data?.recommendedAction), `valid risk score + action (${fraud.data?.recommendedAction})`);
  const fraudForbidden = await api('GET', `/admin/fraud/creators/${host}`, { token: VTOK });
  ok(fraudForbidden.status === 403, `non-admin blocked from fraud assessment (${fraudForbidden.status})`);

  // 12. ROOM ENDED + JOIN GUARD
  console.log('\n=== ROOM ENDED ===');
  const endP = waitForEvent(socket, 'room.ended');
  await api('POST', `/live-rooms/${roomId}/end`, { token: CTOK });
  const end = await endP;
  ok(!!end && end.reason === 'HOST_ENDED', `room.ended received (${end?.reason})`);
  const rejoin = await api('POST', `/live-rooms/${roomId}/join-token`, { token: VTOK });
  ok(rejoin.status >= 400, `cannot get a join token for an ended room (${rejoin.status})`);
  socket.close();

  // 13. LEDGER INTEGRITY + AUDIT LOGS
  console.log('\n=== INTEGRITY ===');
  const integ = await api('GET', '/admin/ledger/integrity', { token: ATOK });
  ok(integ.data?.ok === true, 'ledger integrity ok=true');
  ok(Array.isArray(integ.data?.imbalancedTransactions) && integ.data.imbalancedTransactions.length === 0, 'no imbalanced transactions');
  const audits = await api('GET', '/admin/audit-logs', { token: ATOK });
  ok(Array.isArray(audits.data) && audits.data.length > 0, 'audit logs present');

  await finish();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
