import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController, commitSha } from './health.controller';

const make = (dbOk: boolean, redisOk: boolean | Error) => {
  const prisma: any = { $queryRaw: dbOk ? jest.fn().mockResolvedValue([1]) : jest.fn().mockRejectedValue(new Error('db')) };
  const redis: any = { ping: jest.fn().mockImplementation(() => (redisOk instanceof Error ? Promise.reject(redisOk) : Promise.resolve(redisOk))) };
  return new HealthController(prisma, redis);
};

describe('HealthController', () => {
  it('liveness returns ok', () => {
    expect(make(true, true).health()).toMatchObject({ status: 'ok' });
  });

  // The deploy job compares this against the commit it pushed, so it has to be
  // the real one — and has to say so plainly when it is not available.
  describe('deployed commit on the wire', () => {
    const saved = { git: process.env.GIT_SHA, railway: process.env.RAILWAY_GIT_COMMIT_SHA };
    afterEach(() => {
      saved.git === undefined ? delete process.env.GIT_SHA : (process.env.GIT_SHA = saved.git);
      saved.railway === undefined
        ? delete process.env.RAILWAY_GIT_COMMIT_SHA
        : (process.env.RAILWAY_GIT_COMMIT_SHA = saved.railway);
    });

    it('reports GIT_SHA when the deploy job set it', () => {
      process.env.GIT_SHA = 'abc1234';
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
      expect(commitSha()).toBe('abc1234');
      expect(make(true, true).health()).toMatchObject({ commit: 'abc1234' });
    });

    it("falls back to Railway's own sha on a git-triggered deploy", () => {
      delete process.env.GIT_SHA;
      process.env.RAILWAY_GIT_COMMIT_SHA = 'def5678';
      expect(commitSha()).toBe('def5678');
    });

    it('prefers GIT_SHA over the Railway value when both are present', () => {
      process.env.GIT_SHA = 'ours';
      process.env.RAILWAY_GIT_COMMIT_SHA = 'theirs';
      expect(commitSha()).toBe('ours');
    });

    it("says 'unknown' rather than pretending, when neither is set", () => {
      delete process.env.GIT_SHA;
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
      expect(commitSha()).toBe('unknown');
    });

    it('treats an empty value as absent, not as a valid sha', () => {
      process.env.GIT_SHA = '';
      process.env.RAILWAY_GIT_COMMIT_SHA = '';
      expect(commitSha()).toBe('unknown');
    });
  });
  it('readiness ok when db + redis are up', async () => {
    expect(await make(true, true).ready()).toMatchObject({ status: 'ready', checks: { db: true, redis: true } });
  });
  it('readiness 503 when db is down', async () => {
    await expect(make(false, true).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('readiness 503 when redis is down (and tolerates a thrown ping)', async () => {
    await expect(make(true, false).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(make(true, new Error('redis')).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
