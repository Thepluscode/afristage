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

  it('countsFor maps several rooms and emitToRoom is a no-op without a server', () => {
    const { gateway } = rich();
    const counts = gateway.countsFor(['A', 'B']);
    expect(counts.get('A')).toBe(0);
    (gateway as any).server = undefined;
    expect(() => gateway.emitToRoom('A', 'x', {})).not.toThrow();
  });
});
