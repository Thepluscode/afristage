// Monthly host target bonus, end to end through the real API:
// viewer buys coins -> gifts the host -> (gift rows moved into an otherwise
// empty past month) -> admin sets the ladder -> previews -> pays the month ->
// host sees the bonus -> a second pay pays nothing -> ledger integrity holds.
//
// Gift rows are moved into a random month in the 1900s so this run owns the
// whole month (no real host's gifts, no previously-paid month) — that one
// timestamp UPDATE is the only write that bypasses the API, and it is undone
// at the end. The ladder is restored to what it was.
import { ok, sql, api, login, finish, SEED, buyCoins, giftCoins } from './_lib.mjs';

const balanceSql = (type, userId) =>
  `select coalesce(sum(case when e.direction='CREDIT' then e.amount_minor else -e.amount_minor end),0) from wallet_accounts wa join ledger_entries e on e.account_id=wa.id where wa.account_type='${type}'` +
  (userId ? ` and wa.user_id='${userId}'` : ` and wa.user_id is null`);

const VTOK = await login('viewer@afristage.local', SEED.viewer);
const CTOK = await login('creator@afristage.local', SEED.creator);
const ATOK = await login('admin@afristage.local', SEED.admin);
ok(VTOK && CTOK && ATOK, 'seeded viewer/creator/admin login');
const viewerId = (await api('GET', '/users/me', { token: VTOK })).data?.id;
const hostId = (await api('GET', '/users/me', { token: CTOK })).data?.id;

console.log('\n=== guards ===');
const now = new Date();
const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const open = await api('POST', `/admin/target-bonus/months/${thisMonth}/pay`, { token: ATOK });
ok(open.status === 400 && /has not ended yet/.test(open.data?.message), `the running month ${thisMonth} cannot be paid (status ${open.status})`);
const asViewer = await api('POST', `/admin/target-bonus/months/1950-01/pay`, { token: VTOK });
ok(asViewer.status === 403, `a viewer cannot pay bonuses (status ${asViewer.status})`);
const bad = await api('GET', '/admin/target-bonus/months/2026-13', { token: ATOK });
ok(bad.status === 400, `a malformed month is a 400 (status ${bad.status})`);
const dupTiers = await api('POST', '/admin/target-bonus/tiers', {
  token: ATOK,
  body: { tiers: [{ minGiftCoins: 5, bonusCoins: 1 }, { minGiftCoins: 5, bonusCoins: 2 }] }
});
ok(dupTiers.status === 400, `two tiers with the same target are rejected (status ${dupTiers.status})`);

console.log('\n=== host earns gifts ===');
let rooms = (await api('GET', '/live-rooms')).data || [];
let roomId = rooms.find((r) => r.status === 'LIVE' && r.hostUserId === hostId)?.id;
if (!roomId) {
  const cr = await api('POST', '/live-rooms', { token: CTOK, body: { title: 'Target bonus run', category: 'MUSIC', country: 'NG', language: 'pidgin' } });
  roomId = cr.data?.id;
  await api('POST', `/live-rooms/${roomId}/start`, { token: CTOK });
}
ok(!!roomId, `live room hosted by the creator (${roomId})`);
const gift = ((await api('GET', '/gifts')).data || [])[0];
const stamp = Date.now();
const keyPrefix = `tb-${stamp}`;
const GIFT_COINS = Number(gift.coinPrice) * Math.max(1, Math.ceil(300 / Number(gift.coinPrice)));
await buyCoins(VTOK, GIFT_COINS);
const sent = await giftCoins(VTOK, roomId, GIFT_COINS, gift.id, Number(gift.coinPrice), keyPrefix);
ok(sent?.status === 200 || sent?.status === 201, `viewer gifted the host ${GIFT_COINS} coins (status ${sent?.status})`);

// Pick an unused month in the 1900s and move exactly this run's gift rows into it.
let month;
for (let i = 0; i < 20 && !month; i++) {
  const m = `19${String(10 + Math.floor(Math.random() * 90))}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`;
  const used = await sql(`select count(*) from ledger_transactions where idempotency_key='target-bonus:${m}'`);
  const gifts = await sql(`select count(*) from gift_transactions where created_at >= '${m}-01' and created_at < ('${m}-01'::date + interval '1 month')`);
  if (used === '0' && gifts === '0') month = m;
}
ok(!!month, `chose an empty past month ${month}`);
const runRows = `select gt.id from gift_transactions gt join ledger_transactions lt on lt.id=gt.ledger_transaction_id where lt.idempotency_key like 'gift:${viewerId}:${keyPrefix}-%'`;
const originalAt = await sql(`select min(created_at)::text from gift_transactions where id in (${runRows})`);
await sql(`update gift_transactions set created_at='${month}-15T12:00:00Z' where id in (${runRows})`);
const moved = await sql(`select coalesce(sum(total_coin_amount),0) from gift_transactions where created_at >= '${month}-01' and created_at < ('${month}-01'::date + interval '1 month')`);
ok(Number(moved) === GIFT_COINS, `the month holds exactly this run's ${GIFT_COINS} gift coins (${moved})`);

console.log('\n=== admin sets the ladder and previews ===');
const originalTiers = (await api('GET', '/admin/target-bonus/tiers', { token: ATOK })).data || [];
const LOW = { minGiftCoins: GIFT_COINS, bonusCoins: 7 }; // reached exactly: the boundary counts
const HIGH = { minGiftCoins: GIFT_COINS + 1, bonusCoins: 1000 }; // missed by one coin
const saved = await api('POST', '/admin/target-bonus/tiers', { token: ATOK, body: { tiers: [HIGH, LOW] } });
ok(saved.status === 201 && saved.data?.[0]?.minGiftCoins === LOW.minGiftCoins, `ladder saved and returned sorted (status ${saved.status})`);
const preview = await api('GET', `/admin/target-bonus/months/${month}`, { token: ATOK });
const award = preview.data?.awards?.find((a) => a.userId === hostId);
ok(preview.data?.closed === true && preview.data?.paid === null, `${month} is closed and unpaid`);
ok(award?.giftCoins === GIFT_COINS && award?.bonusCoins === LOW.bonusCoins, `host qualifies for the tier reached exactly, not the one missed by 1 (bonus ${award?.bonusCoins})`);
ok(preview.data?.awards?.length === 1, `only this host qualifies in ${month} (${preview.data?.awards?.length})`);

console.log('\n=== pay ===');
const promoNeed = BigInt(preview.data.totalBonusCoins);
if (BigInt(preview.data.promoBalanceCoins) < promoNeed) {
  const funded = await api('POST', '/admin/missions/fund', { token: ATOK, body: { coins: Number(promoNeed) } });
  ok(funded.status === 201, `funded the promo budget by ${promoNeed} (status ${funded.status})`);
}
const PROMO_SQL = balanceSql('PROMO');
const EARN_SQL = balanceSql('EARNING', hostId);
const promoBefore = BigInt(await sql(PROMO_SQL));
const earnBefore = BigInt(await sql(EARN_SQL));
const paid = await api('POST', `/admin/target-bonus/months/${month}/pay`, { token: ATOK });
ok(paid.status === 201 && !!paid.data?.paid?.ledgerTransactionId && paid.data?.alreadyPaid === false, `${month} paid (status ${paid.status})`);
ok(BigInt(await sql(EARN_SQL)) - earnBefore === BigInt(LOW.bonusCoins), `host EARNING +${LOW.bonusCoins}`);
ok(promoBefore - BigInt(await sql(PROMO_SQL)) === BigInt(LOW.bonusCoins), `PROMO -${LOW.bonusCoins}`);
const audit = await sql(`select count(*) from admin_audit_logs where action='target_bonus.paid' and target='${month}'`);
ok(audit === '1', `pay is audited once (${audit})`);

const again = await api('POST', `/admin/target-bonus/months/${month}/pay`, { token: ATOK });
ok(again.status === 201 && again.data?.alreadyPaid === true, `a second pay reports alreadyPaid (status ${again.status})`);
ok(BigInt(await sql(EARN_SQL)) - earnBefore === BigInt(LOW.bonusCoins), 'the second pay moved nothing');
const txCount = await sql(`select count(*) from ledger_transactions where idempotency_key='target-bonus:${month}'`);
ok(txCount === '1', `exactly one ledger transaction for ${month} (${txCount})`);

console.log('\n=== host view ===');
const mine = await api('GET', '/target-bonus/me', { token: CTOK });
const hist = mine.data?.history?.find((h) => h.month === month);
ok(mine.status === 200 && hist?.bonusCoins === LOW.bonusCoins && hist?.giftCoins === GIFT_COINS, `host sees the ${month} bonus in their history`);
ok(mine.data?.month === thisMonth && typeof mine.data?.giftCoins === 'number', `host sees this month's progress (${mine.data?.giftCoins} gift coins)`);

console.log('\n=== integrity + teardown ===');
const integrity = await api('GET', '/admin/ledger/integrity', { token: ATOK });
ok(integrity.data?.ok === true, `ledger integrity ok after the bonus (status ${integrity.status})`);
await api('POST', '/admin/target-bonus/tiers', { token: ATOK, body: { tiers: originalTiers } });
const restored = (await api('GET', '/admin/target-bonus/tiers', { token: ATOK })).data || [];
ok(JSON.stringify(restored) === JSON.stringify(originalTiers), `ladder restored (${restored.length} tier(s))`);
await sql(`update gift_transactions set created_at='${originalAt}' where id in (${runRows})`);
ok((await sql(`select count(*) from gift_transactions where id in (${runRows}) and created_at < '2000-01-01'`)) === '0', 'gift timestamps restored');

await finish();
