jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));
import Redis from 'ioredis';
import { RedisService } from './redis.service';

const mockCtor = Redis as unknown as jest.Mock;

function withClient(client: any) {
  mockCtor.mockImplementation(() => client);
  return new RedisService();
}

describe('RedisService.ping', () => {
  afterEach(() => jest.clearAllMocks());

  it('pings directly when the client is already ready', async () => {
    const connect = jest.fn();
    const svc = withClient({ status: 'ready', connect, ping: jest.fn().mockResolvedValue('PONG') });
    expect(await svc.ping()).toBe(true);
    expect(connect).not.toHaveBeenCalled();
  });

  it('connects first when not ready, then pings', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const svc = withClient({ status: 'end', connect, ping: jest.fn().mockResolvedValue('PONG') });
    expect(await svc.ping()).toBe(true);
    expect(connect).toHaveBeenCalled();
  });

  it('returns false when the connection cannot be established', async () => {
    const svc = withClient({ status: 'end', connect: jest.fn().mockRejectedValue(new Error('down')), ping: jest.fn() });
    expect(await svc.ping()).toBe(false);
  });

  it('returns false when ping does not answer PONG', async () => {
    const svc = withClient({ status: 'ready', connect: jest.fn(), ping: jest.fn().mockResolvedValue('nope') });
    expect(await svc.ping()).toBe(false);
  });
});

describe('RedisService.onModuleDestroy', () => {
  it('quits the client', async () => {
    const quit = jest.fn().mockResolvedValue('OK');
    const svc = withClient({ status: 'ready', connect: jest.fn(), ping: jest.fn(), quit });
    await svc.onModuleDestroy();
    expect(quit).toHaveBeenCalled();
  });

  it('swallows a quit failure', async () => {
    const quit = jest.fn().mockRejectedValue(new Error('boom'));
    const svc = withClient({ status: 'ready', connect: jest.fn(), ping: jest.fn(), quit });
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
  });
});

describe('RedisService construction', () => {
  it('configures a non-reconnecting retry strategy', () => {
    withClient({ status: 'ready', connect: jest.fn(), ping: jest.fn(), quit: jest.fn() });
    const opts = mockCtor.mock.calls[mockCtor.mock.calls.length - 1][1];
    expect(opts.retryStrategy()).toBeNull(); // never reconnect-storm
    expect(opts.lazyConnect).toBe(true);
  });
});
