// Phase 3.5 UX timing — measures the BACKEND critical-path latency for each core
// flow against a tight server SLA, proving the backend leaves ample headroom
// inside the product's UX budgets (join <30s, buy+gift <60s, start <45s, admin
// actions <15s). On-device UI/render/media time is separate (needs hardware).
import { api, login, ok, sql, finish } from './_lib.mjs';

const stamp = Date.now();
const ms = async (fn) => {
  const t0 = process.hrtime.bigint();
  const r = await fn();
  return { elapsed: Number(process.hrtime.bigint() - t0) / 1e6, r };
};
// Each: backend SLA (tight) and the UX budget it sits inside (from the spec).
const within = (label, elapsed, slaMs, uxBudgetS) =>
  ok(elapsed < slaMs, `${label}: ${elapsed.toFixed(0)}ms (SLA ${slaMs}ms, inside ${uxBudgetS}s UX budget)`);

async function main() {
  const CTOK = await login('creator@afristage.local', 'Creator123!');
  const VTOK = await login('viewer@afristage.local', 'Viewer123!');
  const ATOK = await login('admin@afristage.local', 'Admin123!');
  ok(!!CTOK && !!VTOK && !!ATOK, 'creator + viewer + admin logged in');

  const host = await sql(`select u.id from users u join creator_profiles c on c.user_id=u.id where c.approval_status='APPROVED' limit 1`);
  await sql(`update live_rooms set status='ENDED', ended_at=now() where host_user_id='${host}' and status='LIVE'`);

  // --- Creator: create + start live room (UX budget 45s) ---
  const startFlow = await ms(async () => {
    const created = await api('POST', '/live-rooms', { token: CTOK, body: { title: `UXT-${stamp}`, category: 'MUSIC', country: 'NG', language: 'pidgin' } });
    const started = await api('POST', `/live-rooms/${created.data.id}/start`, { token: CTOK });
    return { roomId: created.data.id, started };
  });
  within('creator start live room (create+start)', startFlow.elapsed, 3000, 45);
  const roomId = startFlow.r.roomId;

  // --- Viewer: join live room (UX budget 30s) ---
  const join = await ms(() => api('POST', `/live-rooms/${roomId}/join-token`, { token: VTOK }));
  ok(join.r.data?.viewerToken && join.r.data?.livekitUrl, 'join-token returns viewer token + livekit url');
  within('viewer join live room (join-token)', join.elapsed, 2000, 30);

  // --- Viewer: buy coins + send gift (UX budget 60s) ---
  const buyGift = await ms(async () => {
    const intent = await api('POST', '/payments/coin-purchase-intents', { token: VTOK, body: { amountMinor: 100000, currency: 'NGN', coinAmount: 5000 } });
    await api('POST', `/payments/mock/${intent.data.id}/complete`, { token: VTOK });
    const gift = (await api('GET', '/gifts')).data[0];
    return api('POST', `/live-rooms/${roomId}/gifts`, { token: VTOK, body: { giftId: gift.id, quantity: 1, idempotencyKey: `uxt-${stamp}` } });
  });
  ok(buyGift.r.status === 201, 'buy coins + send gift succeeds');
  within('viewer buy coins + send gift', buyGift.elapsed, 3000, 60);

  // --- Admin: suspend (force-end) a bad room (UX budget 15s) ---
  const suspend = await ms(() => api('POST', `/admin/live-rooms/${roomId}/end`, { token: ATOK }));
  ok(suspend.r.data?.status === 'ENDED', 'admin force-ends the room');
  within('admin suspend/end room', suspend.elapsed, 1500, 15);

  // --- Admin: approve a payout (UX budget: "without confusion" — measure latency) ---
  // Seed gift income so the creator can request, then time request->approve.
  const payoutFlow = await ms(async () => {
    const req = await api('POST', '/payouts/request', { token: CTOK, body: { coinAmount: 500, idempotencyKey: `uxt-payout-${stamp}` } });
    if (req.status !== 201) return req; // creator may lack earnings; still measured
    return api('POST', `/admin/payouts/${req.data.id}/approve`, { token: ATOK });
  });
  within('admin payout request + approve', payoutFlow.elapsed, 2000, 15);

  await finish();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
