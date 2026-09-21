import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/public-live/[...path]/route';

const context = (path: string[]) => ({ params: { path } });

afterEach(() => vi.unstubAllGlobals());

describe('public-live proxy', () => {
  it('forwards the allow-listed room discovery request', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', upstream);

    const response = await GET(new NextRequest('http://web.test/api/public-live/live-rooms'), context(['live-rooms']));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('[]');
    expect(upstream).toHaveBeenCalledWith('http://localhost:3000/api/live-rooms', expect.objectContaining({ method: 'GET', cache: 'no-store' }));
  });

  it('rejects paths outside the public viewer surface', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await GET(new NextRequest('http://web.test/api/public-live/users'), context(['users']));

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('allows only the guest-token POST under a room', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('{"roomStatus":"LIVE"}', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', upstream);

    const response = await POST(new NextRequest('http://web.test/api/public-live/live-rooms/r1/guest-token', {
      method: 'POST',
      body: '{}'
    }), context(['live-rooms', 'r1', 'guest-token']));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roomStatus: 'LIVE' });
  });
});
