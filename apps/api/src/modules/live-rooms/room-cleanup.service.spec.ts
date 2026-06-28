import { RoomCleanupService } from './room-cleanup.service';

describe('RoomCleanupService', () => {
  it('sweeps stale rooms', async () => {
    const rooms = { endStaleRooms: jest.fn().mockResolvedValue({ ended: [] }) };
    await new RoomCleanupService(rooms as any).sweep();
    expect(rooms.endStaleRooms).toHaveBeenCalled();
  });

  it('logs and swallows a sweep failure instead of throwing', async () => {
    const rooms = { endStaleRooms: jest.fn().mockRejectedValue(new Error('boom')) };
    await expect(new RoomCleanupService(rooms as any).sweep()).resolves.toBeUndefined();
  });
});
