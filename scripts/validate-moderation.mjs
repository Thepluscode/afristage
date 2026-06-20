import { ok, sql, api, login, finish } from './_lib.mjs';

const stamp = Date.now();
const VTOK = await login('viewer@afristage.local', 'Viewer123!');
const ATOK = await login('admin@afristage.local', 'Admin123!');

// fresh user to ban (so we don't break seeded actors)
const badEmail = `bad_${stamp}@test.local`;
const reg = await api('POST', '/auth/register', { body: { email: badEmail, password: 'Test1234!', username: `b${stamp}`, displayName: 'Bad User', country: 'NG', language: 'pidgin', ageConfirmed: true } });
const badId = reg.data?.userId;

console.log('\n=== MODERATION ===');
const room = ((await api('GET', '/live-rooms')).data || []).find((r) => r.status === 'LIVE');
const report = await api('POST', '/reports', { token: VTOK, body: { targetUserId: badId, roomId: room?.id, reason: 'SPAM', details: 'spamming links', priority: 'HIGH' } });
ok(report.status === 200 || report.status === 201, `viewer can report (status ${report.status})`);
const reports = await api('GET', '/admin/reports', { token: ATOK });
ok(reports.status === 200 && Array.isArray(reports.data), 'admin can list reports');
ok(reports.data.some((r) => r.id === report.data?.id), 'submitted report appears in admin queue');

const auditBefore = parseInt(await sql('select count(*) from admin_audit_logs'), 10);
const ban = await api('POST', `/admin/users/${badId}/ban`, { token: ATOK });
ok(ban.status === 200 || ban.status === 201, `admin can ban user (status ${ban.status})`);
const banned = await login(badEmail, 'Test1234!');
ok(!banned, 'banned user can no longer log in');
const auditAfter = parseInt(await sql('select count(*) from admin_audit_logs'), 10);
ok(auditAfter > auditBefore, `admin action wrote audit log (${auditBefore} -> ${auditAfter})`);

// non-admin cannot use admin endpoint
const forbidden = await api('POST', `/admin/users/${badId}/ban`, { token: VTOK });
ok(forbidden.status === 403, `non-admin blocked from admin action (status ${forbidden.status})`);

console.log('\n=== ROOM SUSPEND -> not joinable ===');
if (room) {
  const susp = await api('POST', `/admin/live-rooms/${room.id}/suspend`, { token: ATOK });
  ok(susp.status === 200 || susp.status === 201, `admin can suspend room (status ${susp.status})`);
  const join = await api('POST', `/live-rooms/${room.id}/join-token`, { token: VTOK });
  ok(join.status >= 400, `suspended room cannot be joined (status ${join.status})`);
} else { ok(false, 'no live room to suspend'); }

await finish();
