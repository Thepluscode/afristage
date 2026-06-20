import { io } from 'socket.io-client';
import { authenticator } from 'otplib';
import { ok, sql, api, wait, finish, WS } from './_lib.mjs';

process.on('unhandledRejection', () => {});
const login = (id, pw, mfaToken) => api('POST', '/auth/login', { body: { identifier: id, password: pw, mfaToken } });

const stamp = Date.now();

console.log('\n=== ADMIN LOGIN AUDIT ===');
const adminId = await sql("select id from users where email='admin@afristage.local'");
const auditBefore = Number(await sql(`select count(*) from admin_audit_logs where action='admin.login' and actor_id='${adminId}'`));
const adminLogin = await login('admin@afristage.local', 'Admin123!');
const ATOK = adminLogin.data.accessToken;
const auditAfter = Number(await sql(`select count(*) from admin_audit_logs where action='admin.login' and actor_id='${adminId}'`));
ok(auditAfter === auditBefore + 1, `privileged login writes admin.login audit (${auditBefore} -> ${auditAfter})`);

console.log('\n=== ADMIN MFA (TOTP) ===');
const email = `mfa_${stamp}@test.local`;
const reg = await api('POST', '/auth/register', { body: { email, password: 'Test1234!', username: `m${stamp}`, displayName: 'MFA User', country: 'NG', language: 'pidgin', ageConfirmed: true } });
const tok = reg.data.accessToken;
const setup = await api('POST', '/auth/mfa/setup', { token: tok });
ok(!!setup.data?.secret && !!setup.data?.otpauthUrl, 'mfa/setup returns secret + otpauth URL');
const secret = setup.data.secret;
const enable = await api('POST', '/auth/mfa/enable', { token: tok, body: { token: authenticator.generate(secret) } });
ok(enable.data?.mfaEnabled === true && enable.data?.recoveryCodes?.length === 8, `mfa/enable confirms + returns 8 recovery codes`);
const recoveryCodes = enable.data.recoveryCodes;

const noToken = await login(email, 'Test1234!');
ok(noToken.status === 401, `login without MFA token rejected (status ${noToken.status})`);
const wrongToken = await login(email, 'Test1234!', '000000');
ok(wrongToken.status === 401, `login with wrong MFA token rejected (status ${wrongToken.status})`);
const withTotp = await login(email, 'Test1234!', authenticator.generate(secret));
ok(!!withTotp.data?.accessToken, 'login with valid TOTP succeeds');
const withRecovery = await login(email, 'Test1234!', recoveryCodes[0]);
ok(!!withRecovery.data?.accessToken, 'login with recovery code succeeds');
const reusedRecovery = await login(email, 'Test1234!', recoveryCodes[0]);
ok(reusedRecovery.status === 401, 'recovery code is single-use (reuse rejected)');

// mfaSecret must never leak
const me = await api('GET', '/users/me', { token: withTotp.data.accessToken });
const meRaw = JSON.stringify(me.data || {});
ok(!meRaw.includes(secret) && !meRaw.includes('mfaSecret'), '/users/me does not leak mfaSecret');

console.log('\n=== JOIN-SPAM DEDUP ===');
const VTOK = (await login('viewer@afristage.local', 'Viewer123!')).data.accessToken;
const CTOK = (await login('creator@afristage.local', 'Creator123!')).data.accessToken;
await api('POST', '/admin/live-rooms/end-stale', { token: ATOK, body: { maxIdleMinutes: 0 } });
const room = await api('POST', '/live-rooms', { token: CTOK, body: { title: 'Sec Room', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
await api('POST', `/live-rooms/${room.data.id}/start`, { token: CTOK });
const viewerId = await sql("select id from users where email='viewer@afristage.local'");
for (let i = 0; i < 4; i++) await api('POST', `/live-rooms/${room.data.id}/join-token`, { token: VTOK });
const partCount = await sql(`select count(*) from room_participants where room_id='${room.data.id}' and user_id='${viewerId}'`);
ok(partCount === '1', `4 joins -> exactly 1 participant row (got ${partCount})`);

console.log('\n=== CHAT RATE LIMIT (default 5 / 5s) ===');
const limit = Number(process.env.CHAT_RATE_LIMIT || 5);
const before = Number(await sql(`select count(*) from chat_messages where room_id='${room.data.id}' and sender_id='${viewerId}'`));
await new Promise((resolve) => {
  const s = io(WS, { auth: { token: VTOK }, transports: ['websocket'] });
  s.on('connect', async () => {
    await s.emitWithAck('room.join', { roomId: room.data.id });
    for (let i = 0; i < 8; i++) s.emit('chat.message', { roomId: room.data.id, message: `spam ${i}`, clientMessageId: `s${i}` });
    await wait(1200);
    s.close();
    resolve();
  });
  s.on('connect_error', () => { ok(false, 'WS connect_error'); resolve(); });
});
const persisted = Number(await sql(`select count(*) from chat_messages where room_id='${room.data.id}' and sender_id='${viewerId}'`)) - before;
ok(persisted === limit, `8 rapid messages -> only ${limit} persisted (got ${persisted}, rest rate-limited)`);

await finish();
