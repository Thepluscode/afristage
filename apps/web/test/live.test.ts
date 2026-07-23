import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiBase, resolveLiveRoomId, fetchGuestToken } from '../lib/live';

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const notOk = (status = 400) => ({ ok: false, status, json: async () => ({}) }) as Response;

afterEach(() => { delete process.env.NEXT_PUBLIC_API_BASE; });

describe('apiBase', () => {
  it('uses the staging default and strips trailing slashes', () => {
    expect(apiBase()).toBe('https://api-production-e12f.up.railway.app/api');
    expect(apiBase('http://localhost:3000/api/')).toBe('http://localhost:3000/api');
    expect(apiBase('http://x/api///')).toBe('http://x/api');
  });
  it('honours an explicit override over the env var, and the env var over the default', () => {
    process.env.NEXT_PUBLIC_API_BASE = 'http://env/api';
    expect(apiBase('http://override/api')).toBe('http://override/api');
    expect(apiBase()).toBe('http://env/api');
  });
});

describe('resolveLiveRoomId', () => {
  it('returns the explicit id without fetching', async () => {
    const doFetch = vi.fn();
    expect(await resolveLiveRoomId('http://b', 'r-explicit', doFetch as never)).toBe('r-explicit');
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('discovers the first LIVE room from a bare array', async () => {
    const doFetch = vi.fn().mockResolvedValue(ok([
      { id: 'r1', status: 'SCHEDULED' },
      { id: 'r2', status: 'LIVE', livekitRoomName: 'afristage-r2' }
    ]));
    expect(await resolveLiveRoomId('http://b', undefined, doFetch as never)).toBe('r2');
    expect(doFetch).toHaveBeenCalledWith('http://b/live-rooms');
  });

  it('unwraps a paginated envelope (data / rooms)', async () => {
    const doFetch = vi.fn().mockResolvedValue(ok({ data: [{ id: 'rD', status: 'LIVE', livekitRoomName: 'x' }] }));
    expect(await resolveLiveRoomId('http://b', null, doFetch as never)).toBe('rD');
    const doFetch2 = vi.fn().mockResolvedValue(ok({ rooms: [{ id: 'rR', status: 'LIVE', id2: 1 }] }));
    expect(await resolveLiveRoomId('http://b', null, doFetch2 as never)).toBe('rR');
  });

  it('returns null when nothing is live', async () => {
    const doFetch = vi.fn().mockResolvedValue(ok([{ id: 'r1', status: 'ENDED' }]));
    expect(await resolveLiveRoomId('http://b', undefined, doFetch as never)).toBeNull();
  });

  it('returns null for an unrecognised body shape (no array, no data/rooms)', async () => {
    const doFetch = vi.fn().mockResolvedValue(ok({ unexpected: true }));
    expect(await resolveLiveRoomId('http://b', undefined, doFetch as never)).toBeNull();
  });

  it('returns null when the listing is unreachable', async () => {
    const doFetch = vi.fn().mockResolvedValue(notOk(503));
    expect(await resolveLiveRoomId('http://b', undefined, doFetch as never)).toBeNull();
  });
});

describe('fetchGuestToken', () => {
  it('POSTs and returns the token payload for a live room', async () => {
    const payload = { viewerToken: 'tok', livekitUrl: 'wss://lk', roomStatus: 'LIVE' };
    const doFetch = vi.fn().mockResolvedValue(ok(payload));
    expect(await fetchGuestToken('http://b', 'r1', doFetch as never)).toEqual(payload);
    expect(doFetch).toHaveBeenCalledWith('http://b/live-rooms/r1/guest-token', { method: 'POST' });
  });

  it('returns null when the room is not live (non-2xx)', async () => {
    const doFetch = vi.fn().mockResolvedValue(notOk(400));
    expect(await fetchGuestToken('http://b', 'r1', doFetch as never)).toBeNull();
  });
});
