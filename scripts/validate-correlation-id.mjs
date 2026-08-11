// Can you follow one request through the logs — including the ones that failed?
//
// The correlation id used to be generated inside a Nest interceptor. Interceptors
// run only AFTER guards, so every request the throttler or the JWT guard rejected
// got no id on its response and no id in the log — the 401s and 429s, which are
// exactly the requests a user complains about. Ordering is invisible in unit
// tests: the interceptor's own tests passed the whole time.
//
// So this asserts the four properties across the REAL middleware chain:
//   1. an id comes back on every response, including rejected ones
//   2. a client-supplied id is honoured, so a caller can quote it in a ticket
//   3. a hostile client-supplied id is replaced, not echoed
//   4. two concurrent requests get two different ids
//
//   API_BASE=https://<host>/api npm run validate:correlation-id
import { ok, api, finish } from './_lib.mjs';

// finish() exits 0 on "0 passed, 0 failed". If an early throw or a refactor ever
// skips the checks, a silent pass is worse than a failure, so count them.
const EXPECTED_CHECKS = 9;
let ran = 0;
const check = (cond, msg) => {
  ran += 1;
  ok(cond, msg);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (res) => res.headers.get('x-request-id');

// 1. The happy path.
{
  const res = await api('GET', '/health');
  check(res.status === 200, `health → ${res.status}`);
  check(UUID.test(idOf(res) || ''), `health carries a generated x-request-id (${idOf(res)})`);
}

// 2. A client id is honoured end to end — this is what makes a support ticket
//    actionable: the user quotes the id their client sent.
{
  const mine = `validate-corr-${Date.now()}`;
  const res = await api('GET', '/health', { headers: { 'x-request-id': mine } });
  check(idOf(res) === mine, `client-supplied id echoed unchanged (${idOf(res)})`);
}

// 3. THE REGRESSION. A request rejected before any controller runs must still be
//    traceable. If the id ever moves back behind the guards, this is the only
//    check here that fails.
{
  const mine = `validate-corr-401-${Date.now()}`;
  const res = await api('GET', '/wallet', { headers: { 'x-request-id': mine } });
  check(res.status === 401, `unauthenticated /wallet → ${res.status} (expected 401)`);
  check(idOf(res) === mine, `REJECTED request still carries its id (${idOf(res)})`);
}

// 4. A hostile id is replaced with a fresh one rather than sanitised or echoed:
//    it lands in every log line, and a truncated/stripped id could collide with
//    a real one.
for (const [label, hostile] of [
  ['newline (log-line forgery)', 'x\nlevel=error msg=forged'],
  ['over-long (64+ chars)', 'z'.repeat(200)],
  ['quote (JSON break-out)', 'a"b']
]) {
  const res = await api('GET', '/health', { headers: { 'x-request-id': hostile } });
  const got = idOf(res) || '';
  check(got !== hostile && UUID.test(got), `hostile id replaced — ${label} → ${got}`);
}

// 5. Ids are per-request, not per-process. A shared module-level variable would
//    pass every check above and fail this one.
{
  const ids = (await Promise.all([1, 2, 3, 4, 5].map(() => api('GET', '/health')))).map(idOf);
  check(new Set(ids).size === ids.length, `5 concurrent requests → ${new Set(ids).size} distinct ids`);
}

ok(ran === EXPECTED_CHECKS, `ran ${ran} of ${EXPECTED_CHECKS} checks`);

await finish();
