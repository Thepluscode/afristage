import { ChatGateway } from './chat.gateway';

// Minimal fakes — presence logic doesn't touch chat/jwt/config.
function makeGateway() {
  const emits: Array<{ room: string; event: string; payload: any }> = [];
  const prisma = { liveRoom: { updateMany: () => Promise.resolve({ count: 0 }) } };
  const gateway = new ChatGateway({} as any, {} as any, {} as any, prisma as any);
  (gateway as any).server = {
    to: (room: string) => ({ emit: (event: string, payload: any) => emits.push({ room, event, payload }) })
  };
  return { gateway, emits };
}

function client(id: string) {
  return { id, join: async () => {}, leave: async () => {} } as any;
}

describe('ChatGateway live presence', () => {
  it('counts viewers up on join and broadcasts the real number', async () => {
    const { gateway, emits } = makeGateway();
    await gateway.join(client('s1'), { roomId: 'A' });
    await gateway.join(client('s2'), { roomId: 'A' });
    expect(gateway.countFor('A')).toBe(2);
    const last = emits[emits.length - 1];
    expect(last).toMatchObject({ room: 'A', event: 'room.viewer_count_updated', payload: { roomId: 'A', count: 2 } });
  });

  it('does not double-count a re-joining socket', async () => {
    const { gateway } = makeGateway();
    const c = client('s1');
    await gateway.join(c, { roomId: 'A' });
    await gateway.join(c, { roomId: 'A' });
    expect(gateway.countFor('A')).toBe(1);
  });

  it('decrements on explicit leave', async () => {
    const { gateway } = makeGateway();
    await gateway.join(client('s1'), { roomId: 'A' });
    const c2 = client('s2');
    await gateway.join(c2, { roomId: 'A' });
    await gateway.leave(c2, { roomId: 'A' });
    expect(gateway.countFor('A')).toBe(1);
  });

  it('self-heals on disconnect across every room the socket was in', async () => {
    const { gateway, emits } = makeGateway();
    const c1 = client('s1');
    await gateway.join(c1, { roomId: 'A' });
    await gateway.join(c1, { roomId: 'B' });
    await gateway.join(client('s2'), { roomId: 'A' });
    emits.length = 0;

    gateway.handleDisconnect(c1);

    expect(gateway.countFor('A')).toBe(1); // s2 still watching A
    expect(gateway.countFor('B')).toBe(0); // B emptied
    const rooms = emits.map((e) => e.room).sort();
    expect(rooms).toEqual(['A', 'B']); // both affected rooms re-broadcast
  });

  it('returns 0 for a room nobody is watching', () => {
    const { gateway } = makeGateway();
    expect(gateway.countFor('ghost')).toBe(0);
    expect(gateway.countsFor(['ghost', 'x'])).toEqual(new Map([['ghost', 0], ['x', 0]]));
  });
});

describe('ChatGateway messaging + auth + resilience', () => {
  function rich(opts: { rejectDb?: boolean; verify?: any } = {}) {
    const emits: Array<{ room: string; event: string; payload: any }> = [];
    const chat = { createMessage: jest.fn().mockResolvedValue({ id: 'm1' }) };
    const jwt = { verify: opts.verify ?? jest.fn().mockReturnValue({ sub: 'u1' }) };
    const config = { getOrThrow: jest.fn().mockReturnValue('secret') };
    const prisma = {
      liveRoom: {
        updateMany: opts.rejectDb
          ? jest.fn().mockRejectedValue(new Error('db down'))
          : jest.fn().mockResolvedValue({ count: 1 })
      }
    };
    const gateway = new ChatGateway(chat as any, jwt as any, config as any, prisma as any);
    (gateway as any).server = { to: (room: string) => ({ emit: (event: string, payload: any) => emits.push({ room, event, payload }) }) };
    return { gateway, emits, chat, jwt, prisma };
  }
  const sock = (id: string, sub = 'u1') => ({ id, data: { user: { sub } }, join: async () => {}, leave: async () => {} } as any);

  it('persists + broadcasts a chat message', async () => {
    const { gateway, emits, chat } = rich();
    const res = await gateway.message(sock('s1'), { roomId: 'A', message: 'hi', clientMessageId: 'c1' });
    expect(chat.createMessage).toHaveBeenCalledWith('u1', 'A', 'hi');
    expect(emits.pop()).toMatchObject({ room: 'A', event: 'chat.message_created' });
    expect(res).toMatchObject({ ok: true, messageId: 'm1', clientMessageId: 'c1' });
  });

  it('broadcasts a reaction with the sender id', async () => {
    const { gateway, emits } = rich();
    const res = await gateway.reaction(sock('s1', 'u9'), { roomId: 'A', reactionType: 'heart' });
    expect(emits.pop()).toMatchObject({ room: 'A', event: 'reaction.sent', payload: { userId: 'u9', reactionType: 'heart' } });
    expect(res).toEqual({ ok: true });
  });

  it('handleConnection attaches the verified user', () => {
    const { gateway } = rich();
    const client: any = { handshake: { auth: { token: 't' }, query: {} }, data: {}, disconnect: jest.fn() };
    gateway.handleConnection(client);
    expect(client.data.user).toEqual({ sub: 'u1' });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('handleConnection disconnects on an invalid token', () => {
    const { gateway } = rich({ verify: jest.fn(() => { throw new Error('bad'); }) });
    const client: any = { handshake: { auth: {}, query: { token: 'bad' } }, data: {}, disconnect: jest.fn() };
    gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('join tolerates a peakViewers DB failure', async () => {
    const { gateway } = rich({ rejectDb: true });
    await expect(gateway.join(sock('s1'), { roomId: 'A' })).resolves.toMatchObject({ ok: true });
  });

  it('finalizeWatch tolerates a DB failure on leave', async () => {
    const { gateway } = rich({ rejectDb: true });
    jest.spyOn(gateway as any, 'now').mockReturnValueOnce(0).mockReturnValue(5000); // join@0, leave@5s
    await gateway.join(sock('s1'), { roomId: 'A' });
    await expect(gateway.leave(sock('s1'), { roomId: 'A' })).resolves.toMatchObject({ ok: true });
  });

  it('countsFor maps several rooms; typed emit is a no-op without a server', () => {
    const { gateway } = rich();
    const counts = gateway.countsFor(['A', 'B']);
    expect(counts.get('A')).toBe(0);
    expect(gateway.viewerCount('A')).toBe(0); // RoomPresence port delegates to countFor
    (gateway as any).server = undefined;
    expect(() => gateway.emit('A', 'chat.deleted', { roomId: 'A', messageId: 'm1' })).not.toThrow();
  });
});

// --- Redis adapter (multi-instance fan-out) ---
jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => {
    const inst: any = { on: jest.fn(), quit: jest.fn().mockResolvedValue('OK') };
    inst.duplicate = jest.fn(() => {
      const dup: any = { on: jest.fn(), quit: jest.fn().mockResolvedValue('OK') };
      (MockRedis as any).lastSub = dup;
      return dup;
    });
    (MockRedis as any).lastPub = inst;
    return inst;
  });
  return { __esModule: true, default: MockRedis };
});
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn().mockReturnValue('ADAPTER') }));

// Re-import AFTER the mocks so the gateway sees the mocked modules.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MockRedis = require('ioredis').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createAdapter } = require('@socket.io/redis-adapter');

describe('ChatGateway Redis adapter', () => {
  const freshGateway = () =>
    new ChatGateway({} as any, {} as any, {} as any, { liveRoom: { updateMany: () => Promise.resolve({ count: 0 }) } } as any);

  afterEach(() => {
    delete process.env.CHAT_REDIS_ADAPTER;
    jest.clearAllMocks();
  });

  it('attaches the adapter with a pub client and a duplicated sub client', () => {
    const gateway = freshGateway();
    const server: any = { adapter: jest.fn() };
    gateway.afterInit(server);
    expect(server.adapter).toHaveBeenCalledWith('ADAPTER');
    expect(createAdapter).toHaveBeenCalledWith(MockRedis.lastPub, MockRedis.lastSub);
    // connection problems are surfaced, not unhandled
    expect(MockRedis.lastPub.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(MockRedis.lastSub.on).toHaveBeenCalledWith('error', expect.any(Function));
    // the wired handlers log rather than throw
    MockRedis.lastPub.on.mock.calls[0][1](new Error('pub down'));
    MockRedis.lastSub.on.mock.calls[0][1](new Error('sub down'));
  });

  it('attaches on the parent Server when handed a Namespace (namespaced gateway)', () => {
    const parent: any = { adapter: jest.fn() };
    const namespace: any = { server: parent }; // what Nest injects for namespace:'/chat'
    freshGateway().afterInit(namespace);
    expect(parent.adapter).toHaveBeenCalledWith('ADAPTER');
  });

  it('uses REDIS_URL when set and the localhost default when not', () => {
    const prev = process.env.REDIS_URL;
    try {
      process.env.REDIS_URL = 'redis://custom:6390';
      freshGateway().afterInit({ adapter: jest.fn() } as any);
      expect(MockRedis).toHaveBeenLastCalledWith('redis://custom:6390');
      delete process.env.REDIS_URL;
      freshGateway().afterInit({ adapter: jest.fn() } as any);
      expect(MockRedis).toHaveBeenLastCalledWith('redis://localhost:6379');
    } finally {
      if (prev === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = prev;
    }
  });

  it('skips the adapter when CHAT_REDIS_ADAPTER=off', () => {
    process.env.CHAT_REDIS_ADAPTER = 'off';
    const gateway = freshGateway();
    const server: any = { adapter: jest.fn() };
    gateway.afterInit(server);
    expect(server.adapter).not.toHaveBeenCalled();
  });

  it('an adapter failure never breaks boot (single-instance fallback)', () => {
    (createAdapter as jest.Mock).mockImplementationOnce(() => {
      throw new Error('adapter boom');
    });
    const gateway = freshGateway();
    const server: any = { adapter: jest.fn() };
    expect(() => gateway.afterInit(server)).not.toThrow();
    expect(server.adapter).not.toHaveBeenCalled();
  });

  it('onModuleDestroy quits both clients and is safe when none were attached', async () => {
    const gateway = freshGateway();
    await expect(gateway.onModuleDestroy()).resolves.toBeUndefined(); // nothing attached
    gateway.afterInit({ adapter: jest.fn() } as any);
    const pub = MockRedis.lastPub;
    const sub = MockRedis.lastSub;
    await gateway.onModuleDestroy();
    expect(pub.quit).toHaveBeenCalled();
    expect(sub.quit).toHaveBeenCalled();
    // quit rejection is swallowed
    pub.quit.mockRejectedValueOnce(new Error('gone'));
    sub.quit.mockRejectedValueOnce(new Error('gone'));
    await expect(gateway.onModuleDestroy()).resolves.toBeUndefined();
  });
});
