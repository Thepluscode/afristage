import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

const make = (dbOk: boolean, redisOk: boolean | Error) => {
  const prisma: any = { $queryRaw: dbOk ? jest.fn().mockResolvedValue([1]) : jest.fn().mockRejectedValue(new Error('db')) };
  const redis: any = { ping: jest.fn().mockImplementation(() => (redisOk instanceof Error ? Promise.reject(redisOk) : Promise.resolve(redisOk))) };
  return new HealthController(prisma, redis);
};

describe('HealthController', () => {
  it('liveness returns ok', () => {
    expect(make(true, true).health()).toMatchObject({ status: 'ok' });
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
