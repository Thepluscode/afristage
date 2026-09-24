import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/public-live/[...path]/route';

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

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

// The proxy makes every viewer look like one IP to the API, whose guest-token
// throttle is per-IP at 30/min. Without a limit applied HERE — where the real
// client is still distinguishable — one abusive viewer spends the budget for
// everyone. These tests are about that, not about upstream's limiter.
describe('public-live proxy rate limiting', () => {
  const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

  const post = (ip: string) =>
    POST(
      new NextRequest('http://web.test/api/public-live/live-rooms/r1/guest-token', {
        method: 'POST',
        body: '{}',
        headers: { 'x-forwarded-for': ip }
      }),
      context(['live-rooms', 'r1', 'guest-token'])
    );

  it('refuses a single client past the window and tells it when to retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok()));
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;

    for (let i = 0; i < 10; i++) expect((await post(ip)).status).toBe(200);

    const refused = await post(ip);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('does not spend one viewer budget on another — the actual bug', async () => {
    const upstream = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', upstream);
    const noisy = '10.1.0.1';
    const quiet = '10.1.0.2';

    for (let i = 0; i < 12; i++) await post(noisy);
    expect((await post(noisy)).status).toBe(429);

    expect((await post(quiet)).status).toBe(200);
  });

  it('does not forward a refused request upstream', async () => {
    const upstream = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', upstream);
    const ip = '10.2.0.1';

    for (let i = 0; i < 10; i++) await post(ip);
    const before = upstream.mock.calls.length;
    expect((await post(ip)).status).toBe(429);
    expect(upstream.mock.calls.length).toBe(before);
  });

  it('answers 502 rather than hanging when the upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timed out')));
    const response = await GET(
      new NextRequest('http://web.test/api/public-live/live-rooms', { headers: { 'x-forwarded-for': '10.3.0.1' } }),
      context(['live-rooms'])
    );
    expect(response.status).toBe(502);
  });
});
