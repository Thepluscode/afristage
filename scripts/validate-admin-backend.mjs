import { ok, sql, api, login, finish } from './_lib.mjs';

const stamp = Date.now();
const reg = async (tag) => {
  const email = `${tag}_${stamp}@test.local`;
  const r = await api('POST', '/auth/register', {
    body: { email, password: 'Test1234!', username: `${tag}${stamp}`, displayName: tag, country: 'NG', language: 'pidgin', ageConfirmed: true }
  });
  return { email, token: r.data.accessToken, userId: r.data.userId };
};

const ATOK = await login('admin@afristage.local', 'Admin123!');
const VTOK = await login('viewer@afristage.local', 'Viewer123!');

console.log('\n=== DASHBOARD METRICS ===');
const dash = (await api('GET', '/admin/dashboard', { token: ATOK })).data;
ok(typeof dash.criticalReports === 'number', `dashboard has criticalReports (${dash.criticalReports})`);
ok(typeof dash.newUsersToday === 'number', `dashboard has newUsersToday (${dash.newUsersToday})`);
ok(typeof dash.newCreatorsToday === 'number', `dashboard has newCreatorsToday (${dash.newCreatorsToday})`);
ok(typeof dash.grossGiftVolumeCoins === 'string', 'grossGiftVolumeCoins serialised as string');

console.log('\n=== USERS: filter + ban + reactivate ===');
const u = await reg('utest');
await api('POST', `/admin/users/${u.userId}/ban`, { token: ATOK });
const banned = (await api('GET', '/admin/users?status=BANNED', { token: ATOK })).data;
ok(banned.some((x) => x.id === u.userId), 'banned user appears in ?status=BANNED filter');
const react = await api('POST', `/admin/users/${u.userId}/reactivate`, { token: ATOK });
ok(react.data?.status === 'ACTIVE', `reactivate -> ACTIVE (${react.data?.status})`);
ok(await sql(`select count(*) from admin_audit_logs where action='user.reactivated' and target='${u.userId}'`) !== '0', 'reactivate wrote audit log');

console.log('\n=== CREATOR approve -> live -> suspend gate ===');
const cand = await reg('cgate');
await api('POST', '/creators/apply', { token: cand.token, body: { stageName: 'CG', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
await api('POST', `/admin/creators/${cand.userId}/approve`, { token: ATOK });
ok((await api('GET', '/admin/creators?approvalStatus=APPROVED', { token: ATOK })).data.some((c) => c.userId === cand.userId), 'approved creator appears in ?approvalStatus=APPROVED');
let candTok = await login(cand.email, 'Test1234!');
const room = await api('POST', '/live-rooms', { token: candTok, body: { title: 'Gate Room', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
await api('POST', `/live-rooms/${room.data.id}/start`, { token: candTok });
ok(room.status === 201, 'approved creator created a room');

console.log('\n=== LIVE ROOMS: filter + get + admin end ===');
const live = (await api('GET', '/admin/live-rooms?status=LIVE', { token: ATOK })).data;
ok(live.some((r) => r.id === room.data.id), 'room appears in ?status=LIVE');
const single = await api('GET', `/admin/live-rooms/${room.data.id}`, { token: ATOK });
ok(single.data?.id === room.data.id, 'GET /admin/live-rooms/:id returns the room');
const ended = await api('POST', `/admin/live-rooms/${room.data.id}/end`, { token: ATOK });
ok(ended.data?.status === 'ENDED', `admin force-end -> ENDED (${ended.data?.status})`);
ok(await sql(`select count(*) from admin_audit_logs where action='room.ended' and target='${room.data.id}'`) !== '0', 'force-end wrote audit log');

// now suspend the creator: they can no longer go live
await api('POST', `/admin/creators/${cand.userId}/suspend`, { token: ATOK, body: { reason: 'tos' } });
candTok = await login(cand.email, 'Test1234!');
const blocked = await api('POST', '/live-rooms', { token: candTok, body: { title: 'No', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
ok(blocked.status === 403, `suspended creator cannot create a room (${blocked.status})`);

console.log('\n=== REPORTS: ESCALATE + filter ===');
const rep = await api('POST', '/reports', { token: VTOK, body: { targetUserId: cand.userId, reason: 'SPAM', details: 'x' } });
ok(await sql(`select priority from reports where id='${rep.data.id}'`) === 'MEDIUM', 'SPAM report starts MEDIUM');
const esc = await api('POST', `/admin/reports/${rep.data.id}/action`, { token: ATOK, body: { action: 'ESCALATE' } });
ok(esc.data?.priority === 'CRITICAL' && esc.data?.status === 'REVIEWING', `ESCALATE -> CRITICAL/REVIEWING (${esc.data?.priority}/${esc.data?.status})`);
const crit = (await api('GET', '/admin/reports?priority=CRITICAL', { token: ATOK })).data;
ok(crit.some((r) => r.id === rep.data.id), 'escalated report appears in ?priority=CRITICAL');

console.log('\n=== PAYOUTS: hold + release + filter ===');
const cTok = await login('creator@afristage.local', 'Creator123!');
const reqP = await api('POST', '/payouts/request', { token: cTok, body: { coinAmount: 600, idempotencyKey: `admin-hold-${stamp}` } });
ok(reqP.data?.status === 'UNDER_REVIEW', `payout requested UNDER_REVIEW (${reqP.data?.status})`);
const held = await api('POST', `/admin/payouts/${reqP.data.id}/hold`, { token: ATOK, body: { reason: 'investigate' } });
ok(held.data?.status === 'HELD', `admin hold -> HELD (${held.data?.status})`);
const inHeld = (await api('GET', '/admin/payouts?status=HELD', { token: ATOK })).data;
ok(inHeld.some((p) => p.id === reqP.data.id), 'held payout appears in ?status=HELD');
const rel = await api('POST', `/admin/payouts/${reqP.data.id}/release`, { token: ATOK });
ok(rel.data?.status === 'UNDER_REVIEW', `release -> UNDER_REVIEW (${rel.data?.status})`);
await api('POST', `/admin/payouts/${reqP.data.id}/reject`, { token: ATOK, body: { reason: 'cleanup' } }); // return funds

console.log('\n=== LEDGER INTEGRITY shape ===');
const integ = (await api('GET', '/admin/ledger/integrity', { token: ATOK })).data;
ok(integ.ok === true, 'ledger integrity ok=true');
ok(Array.isArray(integ.imbalancedTransactions) && integ.imbalancedTransactions.length === 0, 'imbalancedTransactions is empty array');

await finish();
