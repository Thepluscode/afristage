// Does the ordinary mistake return an ordinary error?
//
// Every other suite here drives the happy path with fresh, unique data — which
// is why a duplicate signup returned "500 Internal server error" on the funnel's
// first screen for who knows how long, and was found by a user's browser console
// rather than by any of this. People repeat themselves: they submit twice,
// double-tap, come back next week and sign up again with the same email.
//
// So this does everything TWICE, and sends malformed and unauthorised input, and
// asserts one thing: nothing answers 5xx. A 4xx is a product decision; a 5xx is a
// bug wearing an outage costume.
//
//   API_BASE=https://<host>/api npm run validate:error-paths
import { ok, api, finish } from './_lib.mjs';

const stamp = Date.now();
const seen = [];

// A 5xx is the failure. Anything in 2xx/4xx is the endpoint answering for itself.
async function noServerError(label, fn) {
  let status;
  try {
    status = (await fn()).status;
  } catch (e) {
    ok(false, `${label} — threw before answering (${e.message})`);
    return;
  }
  seen.push({ label, status });
  ok(status < 500, `${label} → ${status}${status >= 500 ? '  <-- SERVER ERROR' : ''}`);
}

const account = async (tag) => {
  const email = `errpath-${tag}-${stamp}@afristage.test`;
  const res = await api('POST', '/auth/register', {
    body: {
      email,
      password: 'ErrPath1!',
      username: `ep${tag}${stamp}`,
      displayName: 'Error Path',
      country: 'NG',
      language: 'pidgin',
      ageConfirmed: true
    }
  });
  return { email, token: res.data?.accessToken, userId: res.data?.userId, username: `ep${tag}${stamp}` };
};

console.log('\n=== ordinary mistakes must not look like outages ===\n');

const a = await account('a');
const b = await account('b');
ok(!!a.token && !!b.token, 'two accounts created for the probe');

// --- the one that actually bit ---
await noServerError('register again with the same email', () =>
  api('POST', '/auth/register', {
    body: { email: a.email, password: 'ErrPath1!', username: `${a.username}x`, displayName: 'D', country: 'NG', language: 'pidgin', ageConfirmed: true }
  })
);
await noServerError('register with a username someone already took', () =>
  api('POST', '/auth/register', {
    body: { email: `other-${stamp}@afristage.test`, password: 'ErrPath1!', username: a.username, displayName: 'D', country: 'NG', language: 'pidgin', ageConfirmed: true }
  })
);

// --- repeat the same action twice, everywhere it is cheap to try ---
await noServerError('follow someone', () => api('POST', `/users/${b.userId}/follow`, { token: a.token }));
await noServerError('follow the same person again', () => api('POST', `/users/${b.userId}/follow`, { token: a.token }));

await noServerError('block someone', () => api('POST', `/users/${b.userId}/block`, { token: a.token }));
await noServerError('block the same person again', () => api('POST', `/users/${b.userId}/block`, { token: a.token }));

await noServerError('apply as a creator', () =>
  api('POST', '/creators/apply', { token: a.token, body: { stageName: 'EP', category: 'MUSIC', country: 'NG', language: 'pidgin' } })
);
await noServerError('apply as a creator again', () =>
  api('POST', '/creators/apply', { token: a.token, body: { stageName: 'EP', category: 'MUSIC', country: 'NG', language: 'pidgin' } })
);

await noServerError('add a payout method', () =>
  api('POST', '/payouts/methods', { token: a.token, body: { provider: 'BANK', country: 'NG', currency: 'NGN', destinationReference: '0123456789', label: 'Bank' } })
);
await noServerError('add the identical payout method again', () =>
  api('POST', '/payouts/methods', { token: a.token, body: { provider: 'BANK', country: 'NG', currency: 'NGN', destinationReference: '0123456789', label: 'Bank' } })
);

await noServerError('open a support ticket', () =>
  api('POST', '/support/tickets', { token: a.token, body: { type: 'PAYMENT', subject: 'probe', description: 'probe' } })
);

await noServerError('join the waitlist', () => api('POST', '/beta/request', { body: { email: a.email, displayName: 'D', category: 'MUSIC', country: 'NG' } }));
await noServerError('join the waitlist again with the same email', () =>
  api('POST', '/beta/request', { body: { email: a.email, displayName: 'D', category: 'MUSIC', country: 'NG' } })
);
await noServerError('redeem an invite code that does not exist', () => api('POST', '/beta/accept', { token: a.token, body: { code: 'not-a-real-code' } }));

// --- malformed and unauthorised input ---
// A stale shared link must say the stream has ended, not answer 200 with an
// empty body that renders as a broken room.
{
  const gone = await api('GET', `/live-rooms/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`);
  seen.push({ label: 'ask for a room that does not exist', status: gone.status });
  ok(gone.status === 404, `a room that does not exist answers 404, not an empty 200 (${gone.status})`);
}
await noServerError('ask for a room with an id that is not a uuid', () => api('GET', '/live-rooms/not-a-uuid'));
await noServerError('gift into a room that does not exist', () =>
  api('POST', `/live-rooms/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/gifts`, { token: a.token, body: { giftId: 'x', quantity: 1, idempotencyKey: `ep-${stamp}` } })
);
await noServerError('request a payout with no earnings', () =>
  api('POST', '/payouts/request', { token: a.token, body: { coinAmount: 100000, idempotencyKey: `ep-payout-${stamp}` } })
);
await noServerError('buy coins with a package that does not exist', () =>
  api('POST', '/payments/coin-purchase-intents', { token: a.token, body: { packageId: 'no-such-package' } })
);
await noServerError('log in with the wrong password', () => api('POST', '/auth/login', { body: { identifier: a.email, password: 'wrong' } }));
await noServerError('reach an admin route as a viewer', () => api('GET', '/admin/creators', { token: a.token }));
await noServerError('reach a protected route with a garbage token', () => api('GET', '/users/me', { token: 'garbage' }));

const server = seen.filter((s) => s.status >= 500);
if (server.length) {
  console.log('\n  Endpoints answering 5xx to an ordinary mistake:');
  for (const s of server) console.log(`    ${s.status}  ${s.label}`);
}
console.log(`\n  Throwaway accounts left behind: errpath-*-${stamp}@afristage.test\n`);
await finish();
