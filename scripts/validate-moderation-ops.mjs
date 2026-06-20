import { io } from 'socket.io-client';
import { ok, sql, api, login, wait, finish, WS } from './_lib.mjs';

process.on('unhandledRejection', () => {}); // ignore socket teardown noise

const CTOK = await login('creator@afristage.local', 'Creator123!');
const VTOK = await login('viewer@afristage.local', 'Viewer123!');
const ATOK = await login('admin@afristage.local', 'Admin123!');
const viewerId = await sql("select id from users where email='viewer@afristage.local'");

// clear any live rooms so the creator can start fresh ones
await api('POST', '/admin/live-rooms/end-stale', { token: ATOK, body: { maxIdleMinutes: 0 } });

console.log('\n=== AUTO-END STALE ROOMS ===');
const roomS = await api('POST', '/live-rooms', { token: CTOK, body: { title: 'Stale Room', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
await api('POST', `/live-rooms/${roomS.data.id}/start`, { token: CTOK });
ok(await sql(`select status from live_rooms where id='${roomS.data.id}'`) === 'LIVE', 'room started LIVE');
// backdate last activity to 1h ago (no chat/gift) so it is provably stale
await sql(`update live_rooms set started_at = now() - interval '1 hour' where id='${roomS.data.id}'`);
const swept = await api('POST', '/admin/live-rooms/end-stale', { token: ATOK }); // default 30 min idle
ok(swept.data?.ended?.includes(roomS.data.id), `stale room auto-ended (${swept.data?.ended?.length} ended)`);
ok(await sql(`select status from live_rooms where id='${roomS.data.id}'`) === 'ENDED', 'stale room status ENDED');
const joinStale = await api('POST', `/live-rooms/${roomS.data.id}/join-token`, { token: VTOK });
ok(joinStale.status >= 400, `ended room cannot be joined (status ${joinStale.status})`);
const restartEnded = await api('POST', `/live-rooms/${roomS.data.id}/start`, { token: CTOK });
ok(restartEnded.status === 400, `ENDED room cannot be restarted (status ${restartEnded.status})`);
// a fresh room with recent activity must NOT be swept
const roomFresh = await api('POST', '/live-rooms', { token: CTOK, body: { title: 'Fresh', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
await api('POST', `/live-rooms/${roomFresh.data.id}/start`, { token: CTOK });
const swept2 = await api('POST', '/admin/live-rooms/end-stale', { token: ATOK });
ok(!swept2.data?.ended?.includes(roomFresh.data.id), 'fresh active room is NOT swept');

console.log('\n=== CHAT MUTE / DELETE ENFORCEMENT ===');
const roomM = roomFresh.data.id; // reuse the fresh live room
// mute viewer as host
const muteRes = await api('POST', `/live-rooms/${roomM}/mute/${viewerId}`, { token: CTOK, body: { seconds: 600, reason: 'spam' } });
ok(muteRes.status === 200 || muteRes.status === 201, `host muted viewer (status ${muteRes.status})`);
ok(await sql(`select count(*) from admin_audit_logs where action='room.user_muted' and target='${roomM}'`) !== '0', 'mute wrote admin audit log');
ok(await sql(`select count(*) from moderation_actions where action='USER_MUTED_IN_ROOM' and target_user_id='${viewerId}' and room_id='${roomM}'`) !== '0', 'mute wrote moderation action');

const beforeMutedSend = Number(await sql(`select count(*) from chat_messages where room_id='${roomM}' and sender_id='${viewerId}'`));
await new Promise((resolve) => {
  const s = io(WS, { auth: { token: VTOK }, transports: ['websocket'] });
  s.on('connect', async () => {
    await s.emitWithAck('room.join', { roomId: roomM });
    s.emit('chat.message', { roomId: roomM, message: 'should be blocked', clientMessageId: 'm1' }); // no ack — server rejects muted
    await wait(900);
    s.close();
    resolve();
  });
  s.on('connect_error', () => { ok(false, 'viewer WS connect_error'); resolve(); });
});
const afterMutedSend = Number(await sql(`select count(*) from chat_messages where room_id='${roomM}' and sender_id='${viewerId}'`));
ok(afterMutedSend === beforeMutedSend, `muted user's message not persisted (${beforeMutedSend} -> ${afterMutedSend})`);

// unmute, then the viewer can chat again
await api('POST', `/live-rooms/${roomM}/unmute/${viewerId}`, { token: CTOK });
let sentMessageId = null;
await new Promise((resolve) => {
  const s = io(WS, { auth: { token: VTOK }, transports: ['websocket'] });
  s.on('connect', async () => {
    await s.emitWithAck('room.join', { roomId: roomM });
    const res = await s.emitWithAck('chat.message', { roomId: roomM, message: 'now allowed', clientMessageId: 'm2' });
    sentMessageId = res?.messageId;
    s.close();
    resolve();
  });
  s.on('connect_error', () => { ok(false, 'viewer WS connect_error (unmute)'); resolve(); });
});
ok(!!sentMessageId, `unmuted viewer can chat again (msg ${sentMessageId})`);

// delete the message; it must disappear from the visible listing
const del = await api('DELETE', `/live-rooms/${roomM}/messages/${sentMessageId}`, { token: CTOK });
ok(del.status === 200, `host deleted message (status ${del.status})`);
const visible = await api('GET', `/live-rooms/${roomM}/messages`, { token: VTOK });
const ids = (visible.data || []).map((m) => m.id);
ok(!ids.includes(sentMessageId), 'deleted message hidden from GET /messages');
ok(await sql(`select status from chat_messages where id='${sentMessageId}'`) === 'HIDDEN_BY_MODERATOR', 'message marked HIDDEN_BY_MODERATOR in DB');

// non-host, non-admin cannot moderate
const intruder = await api('POST', `/live-rooms/${roomM}/mute/${viewerId}`, { token: VTOK });
ok(intruder.status === 403, `non-host/non-admin cannot mute (status ${intruder.status})`);

console.log('\n=== BANNED USER CANNOT CHAT (pre-ban token) ===');
const bstamp = Date.now();
const bannedReg = await api('POST', '/auth/register', { body: { email: `banchat_${bstamp}@test.local`, password: 'Test1234!', username: `bc${bstamp}`, displayName: 'Ban Chat', country: 'NG', language: 'pidgin', ageConfirmed: true } });
const bannedTok = bannedReg.data.accessToken; // token issued BEFORE the ban
const bannedId = bannedReg.data.userId;
await api('POST', `/admin/users/${bannedId}/ban`, { token: ATOK });
const beforeBanChat = Number(await sql(`select count(*) from chat_messages where room_id='${roomM}' and sender_id='${bannedId}'`));
await new Promise((resolve) => {
  const s = io(WS, { auth: { token: bannedTok }, transports: ['websocket'] });
  s.on('connect', async () => {
    await s.emitWithAck('room.join', { roomId: roomM });
    s.emit('chat.message', { roomId: roomM, message: 'banned but trying', clientMessageId: 'b1' });
    await wait(900);
    s.close();
    resolve();
  });
  s.on('connect_error', () => { resolve(); });
});
const afterBanChat = Number(await sql(`select count(*) from chat_messages where room_id='${roomM}' and sender_id='${bannedId}'`));
ok(afterBanChat === beforeBanChat, `banned user's chat message not persisted (still ${afterBanChat})`);

await finish();
