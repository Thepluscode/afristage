jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));
import { Logger } from '@nestjs/common';
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

describe('RedisService cache ops (best-effort get/setex/incr)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('get returns the stored value when the client is ready', async () => {
    const svc = withClient({ status: 'ready', connect: jest.fn(), get: jest.fn().mockResolvedValue('v') });
    expect(await svc.get('k')).toBe('v');
  });

  it('setex and incr pass through to the client', async () => {
    const setex = jest.fn().mockResolvedValue('OK');
    const incr = jest.fn().mockResolvedValue(1);
    const svc = withClient({ status: 'ready', connect: jest.fn(), setex, incr });
    await svc.setex('k', 10, 'v');
    await svc.incr('gen');
    expect(setex).toHaveBeenCalledWith('k', 10, 'v');
    expect(incr).toHaveBeenCalledWith('gen');
  });

  it('connects first when not ready', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const svc = withClient({ status: 'end', connect, get: jest.fn().mockResolvedValue('v') });
    expect(await svc.get('k')).toBe('v');
    expect(connect).toHaveBeenCalled();
  });

  it('degrades to null on failure, warns once per outage, and logs recovery', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const client: any = { status: 'end', connect: jest.fn().mockRejectedValue(new Error('down')), get: jest.fn() };
    const svc = withClient(client);
    expect(await svc.get('k')).toBeNull();
    expect(await svc.get('k')).toBeNull(); // still down: no second warn
    expect(warn).toHaveBeenCalledTimes(1);
    client.status = 'ready'; // Redis comes back
    client.get = jest.fn().mockResolvedValue('v');
    expect(await svc.get('k')).toBe('v');
    expect(log).toHaveBeenCalledWith('redis recovered; cache ops restored');
  });

  it('an op failure while connected also degrades to null', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const svc = withClient({ status: 'ready', connect: jest.fn(), get: jest.fn().mockRejectedValue(new Error('boom')) });
    expect(await svc.get('k')).toBeNull();
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
