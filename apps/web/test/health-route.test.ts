import { afterEach, describe, expect, it } from 'vitest';
import { GET } from '../app/api/health/route';

const saved = { git: process.env.GIT_SHA, railway: process.env.RAILWAY_GIT_COMMIT_SHA };
afterEach(() => {
  saved.git === undefined ? delete process.env.GIT_SHA : (process.env.GIT_SHA = saved.git);
  saved.railway === undefined ? delete process.env.RAILWAY_GIT_COMMIT_SHA : (process.env.RAILWAY_GIT_COMMIT_SHA = saved.railway);
});

// The deploy job compares this against the commit it just pushed. Without it a
// 200 proves only that SOMETHING is serving — which is how a stale web client
// sat behind a green pipeline while the API moved on.
describe('web /api/health', () => {
  it('reports the stamped commit', async () => {
    process.env.GIT_SHA = 'abc1234';
    expect(await (await GET()).json()).toMatchObject({ status: 'ok', service: 'web', commit: 'abc1234' });
  });

  it('falls back to the Railway-provided sha', async () => {
    delete process.env.GIT_SHA;
    process.env.RAILWAY_GIT_COMMIT_SHA = 'def5678';
    expect((await (await GET()).json()).commit).toBe('def5678');
  });

  it('prefers the deploy job stamp over the Railway value', async () => {
    process.env.GIT_SHA = 'ours';
    process.env.RAILWAY_GIT_COMMIT_SHA = 'theirs';
    expect((await (await GET()).json()).commit).toBe('ours');
  });

  it("says 'unknown' rather than guessing when nothing is stamped", async () => {
    delete process.env.GIT_SHA;
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    expect((await (await GET()).json()).commit).toBe('unknown');
  });

  it('treats an empty string as absent, not as a sha', async () => {
    process.env.GIT_SHA = '';
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    expect((await (await GET()).json()).commit).toBe('unknown');
  });
});
