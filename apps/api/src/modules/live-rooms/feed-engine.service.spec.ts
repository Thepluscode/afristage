import { FeedEngine } from './feed-engine.service';

// In-memory stand-in for RedisService's best-effort ops: honors TTL via
// Date.now (so jest fake-time tests work) and INCR semantics for the
// generation counter.
function fakeRedis() {
  const store = new Map<string, { v: string; exp: number }>();
  return {
    store,
    get: jest.fn(async (k: string) => {
      const e = store.get(k);
      return e && e.exp > Date.now() ? e.v : null;
    }),
    setex: jest.fn(async (k: string, ttl: number, v: string) => {
      store.set(k, { v, exp: Date.now() + ttl * 1000 });
    }),
    incr: jest.fn(async (k: string) => {
      store.set(k, { v: String(Number(store.get(k)?.v ?? 0) + 1), exp: Number.POSITIVE_INFINITY });
    })
  };
}

function buildFeed(redis: any = fakeRedis()) {
  const prisma: any = {
    liveRoom: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    roomParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { groupBy: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    report: { findMany: jest.fn().mockResolvedValue([]) },
    chatMessage: { findFirst: jest.fn().mockResolvedValue(null) }
  };
    const chat: any = { viewerCount: jest.fn().mockReturnValue(0), emit: jest.fn() };
    return { service: new FeedEngine(prisma, chat, redis), prisma, chat, redis };
}

const liveRoom = (over: any = {}) => ({
  id: 'r1', hostUserId: 'h1', status: 'LIVE', peakViewers: 5,
  language: 'pidgin', country: 'NG', startedAt: new Date(), createdAt: new Date(),
  host: { creatorProfile: { createdAt: new Date() } }, ...over
});

describe('FeedEngine.list (ranked feed)', () => {
  it('returns [] when nothing is live', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    expect(await service.list({})).toEqual([]);
  });

  it('takes the trivial path for a single room (text search + locale match)', async () => {
    const { service, prisma, chat } = buildFeed();
    chat.viewerCount.mockReturnValue(0); // -> peakViewers fallback
    prisma.liveRoom.findMany.mockResolvedValue([liveRoom()]);
    const res = await service.list({ q: 'afro', viewerLanguage: 'pidgin', viewerCountry: 'NG' });
    expect(res).toHaveLength(1);
    expect(res[0].viewerCount).toBe(5); // peakViewers fallback
    expect(res[0].ranking).toBeDefined();
  });

  it('ranks multiple rooms using participants, gifts, and report risk', async () => {
    const { service, prisma, chat } = buildFeed();
    chat.viewerCount.mockImplementation((id: string) => (id === 'r1' ? 42 : 0)); // exercise both || arms
    prisma.liveRoom.findMany.mockResolvedValue([
      liveRoom({ id: 'r1', hostUserId: 'h1' }),
      liveRoom({ id: 'r2', hostUserId: 'h2', host: { creatorProfile: null } }) // creatorAge null arm
    ]);
    prisma.roomParticipant.findMany.mockResolvedValue([
      { roomId: 'r1', joinedAt: new Date(Date.now() - 120_000) },
      { roomId: 'r1', joinedAt: new Date(Date.now() - 60_000) }
    ]);
    prisma.giftTransaction.groupBy.mockResolvedValue([{ roomId: 'r1', _sum: { totalCoinAmount: 300 } }]);
    prisma.report.findMany
      .mockResolvedValueOnce([{ roomId: 'r1', priority: 'HIGH' }]) // room reports
      .mockResolvedValueOnce([{ targetUserId: 'h2', priority: 'CRITICAL' }]); // host reports
    const res = await service.list({ viewerLanguage: 'pidgin', viewerCountry: 'NG' });
    expect(res).toHaveLength(2);
    expect(res[0].viewerCount).toBe(42); // chat.viewerCount left arm for r1
    expect(res.every((r: any) => r.ranking?.score !== undefined)).toBe(true);
  });
});

describe('FeedEngine cache (R5 §9 #3)', () => {
  afterEach(() => {
    delete process.env.FEED_CACHE_TTL_SECONDS;
    jest.restoreAllMocks();
  });

  it('serves the second request from cache but still personalizes per viewer', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([
      liveRoom({ id: 'r1', country: 'NG' }),
      liveRoom({ id: 'r2', country: 'GH', hostUserId: 'h2' })
    ]);
    const first = await service.list({ viewerCountry: 'NG' });
    const second = await service.list({ viewerCountry: 'GH' });
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(1); // slice cached
    // personalization applied per request over the SAME cached slice
    const ngBoost = first.find((r: any) => r.id === 'r1')!.ranking.components.countryMatch;
    const ghBoost = second.find((r: any) => r.id === 'r2')!.ranking.components.countryMatch;
    expect(ngBoost).toBeGreaterThan(0);
    expect(ghBoost).toBeGreaterThan(0);
    expect(second.find((r: any) => r.id === 'r1')!.ranking.components.countryMatch).toBe(0);
  });

  it('caches per (country,category) key and re-queries after the TTL lapses', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({ country: 'NG' });
    await service.list({ country: 'GH' }); // different key -> own query
    await service.list({ country: 'NG' }); // hit
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(2);
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 11_000); // past the 10s default TTL
    await service.list({ country: 'NG' });
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(3);
  });

  it('text search bypasses the cache and TTL=0 disables it', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({ q: 'afro' });
    await service.list({ q: 'afro' });
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(2);
    process.env.FEED_CACHE_TTL_SECONDS = '0';
    await service.list({});
    await service.list({});
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(4);
  });

  it('a garbage TTL env falls back to the 10s default', async () => {
    process.env.FEED_CACHE_TTL_SECONDS = 'not-a-number';
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({});
    await service.list({});
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(1); // still cached
  });

  it('degrades to fresh queries when Redis is unavailable (get/setex are misses)', async () => {
    const deadRedis = { get: jest.fn(async () => null), setex: jest.fn(async () => {}), incr: jest.fn(async () => {}) };
    const { service, prisma } = buildFeed(deadRedis);
    prisma.liveRoom.findMany.mockResolvedValue([liveRoom()]);
    expect(await service.list({})).toHaveLength(1); // still serves, no error
    await service.list({});
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(2); // no cache -> fresh each time
  });

  it('treats a corrupt cached entry as a miss instead of failing the feed', async () => {
    const redis = fakeRedis();
    redis.store.set('feed:slice:0:*:*', { v: 'not-json{', exp: Number.POSITIVE_INFINITY });
    const { service, prisma } = buildFeed(redis);
    prisma.liveRoom.findMany.mockResolvedValue([liveRoom()]);
    expect(await service.list({})).toHaveLength(1); // fresh query, not a crash
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(1);
  });

  it('round-trips BigInt fields through the cache as strings (same as the HTTP layer)', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([liveRoom({ totalWatchSeconds: 10n })]);
    const fresh = await service.list({});
    const cached = await service.list({});
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(1); // second read from cache
    expect(String(fresh[0].totalWatchSeconds)).toBe('10');
    expect((cached[0] as any).totalWatchSeconds).toBe('10');
  });

  it('rankSlice falls back to zero features for a room missing from the slice map', () => {
    const { service } = buildFeed();
    const ranked = (service as any).rankSlice({ rooms: [liveRoom()], features: new Map() }, {});
    expect(ranked[0].ranking.score).toBeDefined();
  });

  it('invalidate() bumps the generation so the next read is fresh', async () => {
    const { service, prisma, redis } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({});
    await service.invalidate();
    expect(redis.incr).toHaveBeenCalledWith('feed:gen');
    await service.list({}); // new generation -> old slice key is never read
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(2);
  });

});

describe('FeedEngine single-room creatorAge null arm', () => {
  it('handles a single room whose host has no creator profile', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([liveRoom({ host: { creatorProfile: null } })]);
    const res = await service.list({});
    expect(res).toHaveLength(1);
  });
});


describe('FeedEngine null gift sum', () => {
  it('coerces a null gift sum to zero in the ranking aggregation', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([
      liveRoom({ id: 'r1' }),
      liveRoom({ id: 'r2', hostUserId: 'h2' })
    ]);
    prisma.giftTransaction.groupBy.mockResolvedValue([{ roomId: 'r1', _sum: { totalCoinAmount: null } }]);
    const res = await service.list({});
    expect(res).toHaveLength(2);
  });
});
