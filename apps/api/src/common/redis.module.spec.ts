jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));
import { RedisModule } from './redis.module';

describe('RedisModule', () => {
  it('is a defined global module class', () => {
    expect(new RedisModule()).toBeDefined();
  });
});
