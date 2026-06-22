// Proves the block-management loop end-to-end against the live API:
// block -> appears in GET me/blocks (with a display name) -> idempotent re-block
// -> unblock -> gone -> idempotent re-unblock.
import { api, login, ok, sql, finish } from './_lib.mjs';

async function main() {
  const token = await login('viewer@afristage.local', 'Viewer123!');
  ok(!!token, 'viewer logged in');

  const targetId = await sql(`select id from users where email='creator@afristage.local' limit 1`);
  ok(!!targetId, 'resolved a target user to block');

  // Clean any prior state so the run is deterministic.
  await api('DELETE', `/users/${targetId}/block`, { token });

  const blocked = await api('POST', `/users/${targetId}/block`, { token });
  ok(blocked.status === 201, `block returns 201 (${blocked.status})`);

  let list = (await api('GET', '/users/me/blocks', { token })).data;
  const entry = list.find((b) => b.id === targetId);
  ok(!!entry, 'blocked user appears in GET me/blocks');
  ok(typeof entry?.displayName === 'string' && entry.displayName.length > 0, `entry has a display name (${entry?.displayName})`);
  ok('blockedAt' in (entry ?? {}), 'entry carries blockedAt');
  ok(!('email' in (entry ?? {})) && !('passwordHash' in (entry ?? {})), 'entry exposes no sensitive fields');

  await api('POST', `/users/${targetId}/block`, { token }); // re-block
  list = (await api('GET', '/users/me/blocks', { token })).data;
  ok(list.filter((b) => b.id === targetId).length === 1, 're-block is idempotent (no duplicate row)');

  const un = await api('DELETE', `/users/${targetId}/block`, { token });
  ok(un.status === 200, `unblock returns 200 (${un.status})`);
  list = (await api('GET', '/users/me/blocks', { token })).data;
  ok(!list.some((b) => b.id === targetId), 'unblocked user no longer in the list');

  const unAgain = await api('DELETE', `/users/${targetId}/block`, { token });
  ok(unAgain.status === 200, `re-unblock is a no-op, not an error (${unAgain.status})`);

  await finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
