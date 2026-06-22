// Proves live viewer presence end-to-end: socket room.join raises the count
// (in the ack, in the broadcast to other viewers, and in the REST feed), and a
// disconnect self-heals the count. Two sockets share one viewer token — presence
// keys on socket id, so they count as two distinct viewers.
import { io } from 'socket.io-client';
import { api, login, ok, sql, finish, B } from './_lib.mjs';

const ORIGIN = B.replace(/\/api\/?$/, '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

const emit = (socket, event, body) => new Promise((resolve) => socket.emit(event, body, (ack) => resolve(ack)));

const viewerCountInList = async (token, roomId) => {
  const list = await api('GET', '/live-rooms', { token });
  return list.data?.find((r) => r.id === roomId)?.viewerCount;
};

async function main() {
  const creatorToken = await login('creator@afristage.local', 'Creator123!');
  const viewerToken = await login('viewer@afristage.local', 'Viewer123!');
  ok(!!creatorToken && !!viewerToken, 'creator + viewer logged in');

  const host = await sql(
    `select u.id from users u join creator_profiles c on c.user_id=u.id where c.approval_status='APPROVED' limit 1`
  );
  await sql(`update live_rooms set status='ENDED', ended_at=now() where host_user_id='${host}' and status='LIVE'`);

  const created = await api('POST', '/live-rooms', { token: creatorToken, body: { title: 'VIEW-TEST', category: 'MUSIC', country: 'NG', language: 'en' } });
  const roomId = created.data?.id;
  const started = await api('POST', `/live-rooms/${roomId}/start`, { token: creatorToken });
  ok(started.status === 201 && started.data?.status === 'LIVE', `room started LIVE (${started.status})`);

  ok((await viewerCountInList(viewerToken, roomId)) === 0, 'feed shows viewerCount 0 before anyone joins');
  const beforeGet = await api('GET', `/live-rooms/${roomId}`, { token: viewerToken });
  ok(beforeGet.data?.viewerCount === 0, 'GET room shows viewerCount 0 before anyone joins');

  // First viewer joins.
  const s1 = await connect(viewerToken);
  const ack1 = await emit(s1, 'room.join', { roomId });
  ok(ack1?.ok === true && ack1?.count === 1, `join ack reports count 1 (${ack1?.count})`);
  ok((await viewerCountInList(viewerToken, roomId)) === 1, 'feed reflects 1 live viewer');

  // Second viewer joins — s1 must receive the updated count broadcast.
  const s2 = await connect(viewerToken);
  const broadcastP = waitForEvent(s1, 'room.viewer_count_updated');
  const ack2 = await emit(s2, 'room.join', { roomId });
  ok(ack2?.count === 2, `second join ack reports count 2 (${ack2?.count})`);
  const broadcast = await broadcastP;
  ok(broadcast?.roomId === roomId && broadcast?.count === 2, `s1 received broadcast count 2 (${broadcast?.count})`);
  ok((await viewerCountInList(viewerToken, roomId)) === 2, 'feed reflects 2 live viewers');

  // Disconnect s2 — count must self-heal to 1 without an explicit leave.
  const healP = waitForEvent(s1, 'room.viewer_count_updated');
  s2.close();
  const heal = await healP;
  ok(heal?.count === 1, `disconnect self-heals count to 1 on s1 (${heal?.count})`);
  ok((await api('GET', `/live-rooms/${roomId}`, { token: viewerToken })).data?.viewerCount === 1, 'GET room reflects 1 after disconnect');

  // Explicit leave drops to 0.
  const leaveAck = await emit(s1, 'room.leave', { roomId });
  ok(leaveAck?.count === 0, `leave ack reports count 0 (${leaveAck?.count})`);
  ok((await viewerCountInList(viewerToken, roomId)) === 0, 'feed back to 0 after last viewer leaves');

  s1.close();
  await api('POST', `/live-rooms/${roomId}/end`, { token: creatorToken });
  await wait(100);
  await finish();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
