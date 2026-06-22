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
