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

console.log('\n=== BETA INVITES ===');
const inv = await api('POST', '/admin/beta-invites', { token: ATOK, body: { email: `invitee_${stamp}@test.local`, type: 'VIEWER' } });
ok(inv.status === 201 && !!inv.data?.code, 'admin creates invite, code returned once');
ok(inv.data?.invite && inv.data.invite.codeHash === undefined, 'invite response does not leak codeHash');
const code = inv.data.code;
const invitee = await reg('invitee');
const acc = await api('POST', '/beta/accept', { token: invitee.token, body: { code } });
ok(acc.data?.status === 'ACCEPTED', `invite accepted (${acc.data?.status})`);
const acc2 = await api('POST', '/beta/accept', { token: invitee.token, body: { code } });
ok(acc2.status >= 400, `used invite cannot be accepted again (${acc2.status})`);
const accBad = await api('POST', '/beta/accept', { token: invitee.token, body: { code: 'not-a-real-code' } });
ok(accBad.status >= 400, `invalid invite code rejected (${accBad.status})`);

console.log('\n=== CREATOR APPROVAL GATE ===');
const cand = await reg('cand');
await api('POST', '/creators/apply', { token: cand.token, body: { stageName: 'Cand', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
ok(await sql(`select approval_status from creator_profiles where user_id='${cand.userId}'`) === 'PENDING', 'application starts PENDING');
const preCreate = await api('POST', '/live-rooms', { token: cand.token, body: { title: 'Nope', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
ok(preCreate.status === 403, `unapproved applicant cannot create a room (${preCreate.status})`);
const approve = await api('POST', `/admin/creators/${cand.userId}/approve`, { token: ATOK });
ok(approve.data?.approvalStatus === 'APPROVED', 'admin approved creator');
ok(await sql(`select count(*) from admin_audit_logs where action='CREATOR_APPROVED' and target='creator:${cand.userId}'`) !== '0', 'approval wrote audit log');
const candTok2 = await login(cand.email, 'Test1234!'); // re-login: token now carries CREATOR role
const postCreate = await api('POST', '/live-rooms', { token: candTok2, body: { title: 'Now Live', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
ok(postCreate.status === 201, `approved creator can create a room (${postCreate.status})`);

console.log('\n=== REPORT AUTO-PRIORITY ===');
const VTOK = await login('viewer@afristage.local', 'Viewer123!');
const rep = await api('POST', '/reports', { token: VTOK, body: { targetUserId: cand.userId, reason: 'UNDERAGE_RISK', details: 'auto-priority test' } });
ok(rep.status === 201, 'report created');
ok(await sql(`select priority from reports where id='${rep.data.id}'`) === 'CRITICAL', 'UNDERAGE_RISK auto-prioritised to CRITICAL');

console.log('\n=== SUPPORT TICKETS (internal notes hidden) ===');
const tkt = await api('POST', '/support/tickets', { token: VTOK, body: { type: 'PAYMENT', subject: 'Coins missing', description: 'bought coins, not showing' } });
ok(tkt.status === 201, 'user opens ticket');
const mine = await api('GET', '/support/tickets/me', { token: VTOK });
ok((mine.data || []).some((t) => t.id === tkt.data.id), 'ticket appears in user list');
await api('POST', `/admin/support/tickets/${tkt.data.id}/messages`, { token: ATOK, body: { message: 'internal: refund queued', internal: true } });
await api('POST', `/admin/support/tickets/${tkt.data.id}/messages`, { token: ATOK, body: { message: 'We are looking into it' } });
const asUser = await api('GET', `/support/tickets/${tkt.data.id}`, { token: VTOK });
const userMsgs = (asUser.data?.messages || []).map((m) => m.message);
ok(!userMsgs.some((m) => m.startsWith('internal:')), 'user does NOT see internal admin note');
ok(userMsgs.includes('We are looking into it'), 'user sees the public admin reply');
const assign = await api('POST', `/admin/support/tickets/${tkt.data.id}/assign`, { token: ATOK });
ok(assign.data?.status === 'IN_REVIEW', 'admin can assign ticket');

console.log('\n=== BETA OPS + RBAC ===');
const ops = await api('GET', '/admin/beta-ops', { token: ATOK });
ok(ops.status === 200 && typeof ops.data?.pendingCreatorApprovals === 'number', 'beta-ops dashboard returns counts');
const opsForbidden = await api('GET', '/admin/beta-ops', { token: VTOK });
ok(opsForbidden.status === 403, `viewer cannot access /admin/beta-ops (${opsForbidden.status})`);

console.log('\n=== MOCK PAYMENT OWNERSHIP ===');
const other = await reg('other');
const intent = await api('POST', '/payments/coin-purchase-intents', { token: VTOK, body: { amountMinor: 1000, currency: 'NGN', coinAmount: 10 } });
const steal = await api('POST', `/payments/mock/${intent.data.id}/complete`, { token: other.token });
ok(steal.status === 403, `cannot complete another user's payment intent (${steal.status})`);

await finish();
