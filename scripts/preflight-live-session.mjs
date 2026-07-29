// Run this in the hour before a real creator goes live.
//
// The first scheduled session is the one that decides whether a creator ever
// comes back, and it will not be lost to a product flaw — it will be lost to a
// LiveKit token, a stale build, or a gate nobody remembered was on. This walks
// the exact path that session takes, against the deployed environment, and says
// which step would have failed.
//
//   API_BASE=https://<api-host>/api WS_BASE=https://<api-host>/chat \
//     npm run preflight:live-session
//
// It uses only public endpoints and a throwaway account, so it needs no admin
// credentials and no database access. It ends the room it opens; the throwaway
// account is left behind (self-deletion is out of scope) and is named
// preflight-* so it is obvious what it was.
import { io } from 'socket.io-client';

const B = process.env.API_BASE || 'http://localhost:3000/api';
const WS = process.env.WS_BASE || 'http://localhost:3000/chat';
const stamp = Date.now();

let pass = 0;
let fail = 0;
let blocked = null;
const ok = (c, m) => {
  console.log(`${c ? '  PASS' : '  FAIL'}  ${m}`);
  c ? pass++ : fail++;
  return c;
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

console.log(`\n=== Pre-flight for a live session against ${B} ===\n`);

// 1. Is the API even the build we think it is, and up?
const health = await api('GET', '/health');
if (!ok(health.status === 200, `API is up (${health.status})`)) process.exit(1);

// 2. A creator can get an account.
const email = `preflight-${stamp}@afristage.test`;
const reg = await api('POST', '/auth/register', {
  body: { email, password: 'Preflight1!', username: `pre${stamp}`, displayName: 'Pre-flight', country: 'NG', language: 'pidgin', ageConfirmed: true }
});
if (!ok(reg.status === 201 || reg.status === 200, `a creator can register (${reg.status})`)) process.exit(1);
let token = reg.data.accessToken;

// 3. …and be approved. This is the step that silently blocks a whole cohort.
const applied = await api('POST', '/creators/apply', {
  token,
  body: { stageName: 'Pre-flight', category: 'MUSIC', country: 'NG', language: 'pidgin' }
});
ok(applied.status === 201 || applied.status === 200, `a creator can apply (${applied.status})`);
const approved = applied.data?.approvalStatus === 'APPROVED';
ok(approved, `the application is approved (${applied.data?.approvalStatus})`);
if (!approved) {
  blocked =
    'No creator can go live without a manual approval right now. Either approve them in admin ' +
    '(Creators queue) before the session, or set BETA_AUTO_APPROVE_CREATORS=true on the api service ' +
    'for the duration of the beta cohort.';
}

// The role only changes on approval, so re-issue the token to pick it up.
if (approved) {
  const login = await api('POST', '/auth/login', { body: { identifier: email, password: 'Preflight1!' } });
  token = login.data?.accessToken ?? token;

  // 4. The room opens and LiveKit actually issues a token — the classic
  //    day-of failure, and invisible until someone tries to broadcast.
  const room = await api('POST', '/live-rooms', {
    token,
    body: { title: `Pre-flight ${stamp}`, category: 'MUSIC', country: 'NG', language: 'pidgin' }
  });
  const roomId = room.data?.id;
  ok(!!roomId, `a room can be created (${room.status})`);

  if (roomId) {
    const started = await api('POST', `/live-rooms/${roomId}/start`, { token });
    ok(started.data?.status === 'LIVE', `the room goes LIVE (${started.data?.status ?? started.status})`);

    // Starting the room only flips a status. Publishing needs a LiveKit token
    // from a separate mint, and THAT is what fails on the day when the LiveKit
    // credentials are wrong or still the dev defaults — the room looks live in
    // the feed while the creator cannot actually broadcast into it.
    const mint = await api('POST', `/live-rooms/${roomId}/join-token`, { token });
    const jwt = mint.data?.viewerToken;
    ok(typeof jwt === 'string' && jwt.split('.').length === 3,
      `LiveKit mints a publish token (${mint.status}${jwt ? '' : ` — ${JSON.stringify(mint.data).slice(0, 90)}`})`);

    // A guest link must play for a signed-out visitor, or every share is a dead end.
    const guest = await api('POST', `/live-rooms/${roomId}/guest-token`);
    const guestJwt = guest.data?.viewerToken;
    ok(typeof guestJwt === 'string' && guestJwt.split('.').length === 3,
      `a shared link plays for a signed-out visitor (${guest.status})`);

    // 5. A viewer finds it, with the gift figure the card shows.
    const feed = await api('GET', '/live-rooms');
    const mine = (feed.data ?? []).find((r) => r.id === roomId);
    ok(!!mine, 'the room appears in the public feed');
    ok(mine && typeof mine.giftCoinTotal === 'number', `the feed carries a gift total (${mine?.giftCoinTotal})`);

    // 6. A viewer can arrive and be heard — a silent room is a dead room.
    await new Promise((resolve) => {
      const sock = io(WS, { auth: { token }, transports: ['websocket'] });
      let settled = false;
      const done = (c, m) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        ok(c, m);
        sock.close();
        resolve();
      };
      const t = setTimeout(() => done(false, 'chat accepts a viewer (timed out after 20s)'), 20_000);
      sock.on('connect_error', (e) => done(false, `chat refused the connection (${e.message})`));
      sock.on('connect', async () => {
        try {
          await sock.emitWithAck('room.join', { roomId });
          const res = await sock.emitWithAck('chat.message', { roomId, message: 'pre-flight', clientMessageId: 'pf1' });
          done(res?.ok === true, `chat accepts a message in the room (${res?.ok ? 'ok' : res?.error})`);
        } catch (e) {
          done(false, `chat failed (${e.message})`);
        }
      });
    });

    // 7. Leave nothing running.
    const ended = await api('POST', `/live-rooms/${roomId}/end`, { token });
    ok(ended.status < 400, `the room can be ended again (${ended.status})`);
  }
}

console.log(`\n========================\n  RESULT: ${pass} passed, ${fail} failed\n========================`);
if (blocked) console.log(`\n  BLOCKED: ${blocked}\n`);
console.log(`  Throwaway account left behind: ${email}\n`);
process.exit(fail ? 1 : 0);
