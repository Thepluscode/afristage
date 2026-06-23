import { ChatGateway } from './chat.gateway';

// Subclass to control the clock so elapsed watch-time is deterministic.
class TestGateway extends ChatGateway {
  public clock = 0;
  protected now(): number {
    return this.clock;
  }
}

function build() {
  const prisma: any = { liveRoom: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const gw = new TestGateway({} as any, {} as any, {} as any, prisma);
  (gw as any).server = { to: () => ({ emit: jest.fn() }) };
  // join() also calls updateMany to bump peakViewers — isolate the watch-time writes.
  const watchCalls = () => prisma.liveRoom.updateMany.mock.calls.filter((c: any[]) => c[0]?.data?.totalWatchSeconds);
  return { gw, prisma, watchCalls };
}

// Minimal fake socket: join/leave are no-ops, id identifies the connection.
function socket(id: string) {
  return { id, join: jest.fn(), leave: jest.fn() } as any;
}

describe('ChatGateway watch-time accumulation', () => {
  it('increments totalWatchSeconds by the seconds between join and leave', async () => {
    const { gw, prisma } = build();
    const s = socket('sock1');
    gw.clock = 1_000_000;
    await gw.join(s, { roomId: 'r1' });
    gw.clock = 1_000_000 + 42_000; // +42s
    await gw.leave(s, { roomId: 'r1' });
    expect(prisma.liveRoom.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { totalWatchSeconds: { increment: 42n } }
    });
  });

  it('finalizes watch-time on disconnect too', async () => {
    const { gw, prisma } = build();
    const s = socket('sock2');
    gw.clock = 0;
    await gw.join(s, { roomId: 'r2' });
    gw.clock = 10_000; // +10s
    gw.handleDisconnect(s);
    expect(prisma.liveRoom.updateMany).toHaveBeenCalledWith({
      where: { id: 'r2' },
      data: { totalWatchSeconds: { increment: 10n } }
    });
  });

  it('does not write watch-time for a sub-second session', async () => {
    const { gw, watchCalls } = build();
    const s = socket('sock3');
    gw.clock = 500;
    await gw.join(s, { roomId: 'r3' });
    gw.clock = 900; // +0.4s -> floor 0
    await gw.leave(s, { roomId: 'r3' });
    expect(watchCalls()).toHaveLength(0);
  });

  it('does not double-count: a second leave for the same socket is a no-op', async () => {
    const { gw, watchCalls } = build();
    const s = socket('sock4');
    gw.clock = 0;
    await gw.join(s, { roomId: 'r4' });
    gw.clock = 5_000;
    await gw.leave(s, { roomId: 'r4' });
    await gw.leave(s, { roomId: 'r4' });
    expect(watchCalls()).toHaveLength(1);
  });
});
