// Proves realtime room broadcasts end-to-end over the live Socket.IO /chat gateway:
// a viewer socket joins a room, then gift.sent (after an HTTP gift) and room.ended
// (after the host ends) must arrive on that socket.
import { io } from 'socket.io-client';
import { api, login, ok, sql, finish, B } from './_lib.mjs';

const ORIGIN = B.replace(/\/api\/?$/, '');

const waitForEvent = (socket, event, timeoutMs = 6000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(`${ORIGIN}/chat`, { auth: { token }, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 6000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });

const emit = (socket, event, body) =>
  new Promise((resolve) => socket.emit(event, body, (ack) => resolve(ack)));

async function main() {
  const creatorToken = await login('creator@afristage.local', 'Creator123!');
  const viewerToken = await login('viewer@afristage.local', 'Viewer123!');
  ok(!!creatorToken && !!viewerToken, 'creator + viewer logged in');

  // Fresh room: clear any stale LIVE rooms for this host (create() blocks on an active one).
  const host = await sql(
    `select u.id from users u join creator_profiles c on c.user_id=u.id where c.approval_status='APPROVED' limit 1`
  );
  await sql(`update live_rooms set status='ENDED', ended_at=now() where host_user_id='${host}' and status='LIVE'`);

  const created = await api('POST', '/live-rooms', { token: creatorToken, body: { title: 'EVT-TEST', category: 'MUSIC', country: 'NG', language: 'en' } });
  const roomId = created.data?.id;
  const started = await api('POST', `/live-rooms/${roomId}/start`, { token: creatorToken });
  ok(started.status === 201 && started.data?.status === 'LIVE', `room started LIVE (${started.status})`);

  // Viewer needs coins to gift.
  const intent = await api('POST', '/payments/coin-purchase-intents', { token: viewerToken, body: { amountMinor: 100000, currency: 'NGN', coinAmount: 500 } });
  await api('POST', `/payments/mock/${intent.data.id}/complete`, { token: viewerToken });

  const socket = await connect(viewerToken);
  ok(socket.connected, 'viewer socket connected to /chat');
  const joinAck = await emit(socket, 'room.join', { roomId });
  ok(joinAck?.ok === true, 'viewer joined the socket room');

  // --- gift.sent ---
  const gifts = await api('GET', '/gifts', { token: viewerToken });
  const giftId = gifts.data?.[0]?.id;
  const giftEventP = waitForEvent(socket, 'gift.sent');
  const sent = await api('POST', `/live-rooms/${roomId}/gifts`, { token: viewerToken, body: { giftId, quantity: 1, idempotencyKey: `evt-${Date.now()}` } });
  ok(sent.status === 201, `gift sent via HTTP (${sent.status})`);
  const giftEvent = await giftEventP;
  ok(!!giftEvent, 'gift.sent broadcast received on the viewer socket');
  ok(giftEvent?.roomId === roomId && typeof giftEvent?.giftName === 'string', 'gift.sent payload has roomId + giftName');

  // --- room.ended ---
  const endedEventP = waitForEvent(socket, 'room.ended');
  await api('POST', `/live-rooms/${roomId}/end`, { token: creatorToken });
  const endedEvent = await endedEventP;
  ok(!!endedEvent, 'room.ended broadcast received on the viewer socket');
  ok(endedEvent?.reason === 'HOST_ENDED', `room.ended reason = HOST_ENDED (${endedEvent?.reason})`);

  socket.close();
  await finish();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
