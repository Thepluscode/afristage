// Proves the explainable live-feed ranking end-to-end through the live HTTP path:
// seeds LIVE rooms with differing signals, asserts GET /live-rooms orders them by
// score (popular-clean > quiet-clean > popular-but-reported), then cleans up.
import { randomUUID } from 'node:crypto';
import { api, ok, sql, finish } from './_lib.mjs';

const MARK = 'RANKTEST';

async function cleanup() {
  // FK order: reports + participants reference rooms; rooms reference the host user.
  await sql(`delete from reports where room_id in (select id from live_rooms where title like '${MARK}-%')`);
  await sql(`delete from room_participants where room_id in (select id from live_rooms where title like '${MARK}-%')`);
  await sql(`delete from live_rooms where title like '${MARK}-%'`);
  // Remove our synthetic, report-free host(s).
  await sql(`delete from users where role='CREATOR' and email is null and password_hash is null`);
}

async function makeRoom(host, title, { viewers, criticalReport }) {
  // Client-side id: sql() can't return RETURNING values (non-SELECT -> executeRaw).
  const id = randomUUID();
  await sql(
    `insert into live_rooms (id, host_user_id, title, category, country, language, status, peak_viewers, total_watch_seconds, started_at, created_at)
     values ('${id}', '${host}', '${title}', 'MUSIC', 'NG', 'en', 'LIVE', ${viewers}, 0, now(), now())`
  );
  // Distinct real users as active participants (left_at null). @@unique(room,user) -> one row each.
  await sql(
    `insert into room_participants (id, room_id, user_id, joined_at, watch_seconds)
     select gen_random_uuid(), '${id}', id, now(), 0 from users limit ${viewers}`
  );
  if (criticalReport) {
    // room-scoped (target_user_id null) so it isolates to THIS room, not the shared host.
    await sql(
      `insert into reports (id, reporter_id, room_id, target_user_id, reason, priority, status, created_at)
       values (gen_random_uuid(), '${host}', '${id}', null, 'SPAM', 'CRITICAL', 'OPEN', now())`
    );
  }
  return id;
}

async function main() {
  await cleanup();
  // Test isolation: end LIVE rooms left by other suites (keeps our 3 in the ranked
  // top-50), and use a FRESH host with no report history — the shared seeded creator
  // accumulates reports from other suites, which would saturate the host-scoped
  // report-risk penalty across all our rooms and mask the flagged room's own report.
  await sql(`update live_rooms set status='ENDED', ended_at=now() where status='LIVE' and title not like '${MARK}-%'`);
  const host = randomUUID();
  await sql(
    `insert into users (id, role, status, age_confirmed, email_verified, phone_verified, mfa_enabled, created_at, updated_at)
     values ('${host}', 'CREATOR', 'ACTIVE', true, false, false, false, now(), now())`
  );
  ok(!!host, `created an isolated host (${host.slice(0, 8)})`);
  const popularClean = await makeRoom(host, `${MARK}-popular-clean`, { viewers: 5 });
  const quietClean = await makeRoom(host, `${MARK}-quiet-clean`, { viewers: 1 });
  const popularFlagged = await makeRoom(host, `${MARK}-popular-flagged`, { viewers: 5, criticalReport: true });

  const { status, data } = await api('GET', '/live-rooms');
  ok(status === 200, `GET /live-rooms 200 (${status})`);
  ok(Array.isArray(data), 'response is an array');

  const ours = data.filter((r) => r.title?.startsWith(MARK));
  ok(ours.length === 3, `all 3 seeded rooms returned (${ours.length})`);
  ok(ours.every((r) => r.ranking && typeof r.ranking.score === 'number'), 'every room carries a ranking breakdown');

  const rank = (id) => ours.findIndex((r) => r.id === id);
  ok(rank(popularClean) < rank(quietClean), 'popular-clean ranks above quiet-clean');
  ok(rank(quietClean) < rank(popularFlagged), 'quiet-clean ranks above popular-but-reported');

  const flagged = ours.find((r) => r.id === popularFlagged);
  ok(flagged.ranking.components.reportRisk < 0, 'flagged room has a negative reportRisk contribution');
  ok(flagged.ranking.score < ours.find((r) => r.id === quietClean).ranking.score, 'report penalty sinks the flagged room below the quiet one');

  // global ordering: returned array is sorted by score desc
  const scores = data.map((r) => r.ranking.score);
  ok(scores.every((s, i) => i === 0 || scores[i - 1] >= s), 'feed is sorted by score desc');

  await cleanup();
  await finish();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
