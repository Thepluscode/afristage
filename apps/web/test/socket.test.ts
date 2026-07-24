import { describe, it, expect, afterEach, vi } from 'vitest';
import { socketOrigin, fetchSocketToken } from '../lib/socket';

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

afterEach(() => { delete process.env.NEXT_PUBLIC_API_BASE; });

describe('socketOrigin', () => {
  it('strips the /api path so the client connects to the root origin', () => {
    expect(socketOrigin('https://api.example.com/api')).toBe('https://api.example.com');
    expect(socketOrigin('https://api.example.com/api/')).toBe('https://api.example.com');
    expect(socketOrigin('http://localhost:3000/api')).toBe('http://localhost:3000');
  });
  it('honours an explicit override and the staging default', () => {
    expect(socketOrigin()).toBe('https://api-production-e12f.up.railway.app');
    process.env.NEXT_PUBLIC_API_BASE = 'https://x/api';
    expect(socketOrigin()).toBe('https://x');
  });
});

describe('fetchSocketToken', () => {
  it('returns the token from the server route', async () => {
    const doFetch = vi.fn().mockResolvedValue(res(200, { token: 'jwt-abc' }));
    expect(await fetchSocketToken(doFetch as never)).toBe('jwt-abc');
    expect(doFetch).toHaveBeenCalledWith('/api/socket-token');
  });
  it('returns null for a guest (no token) or a failed request', async () => {
    expect(await fetchSocketToken(vi.fn().mockResolvedValue(res(200, { token: null })) as never)).toBeNull();
    expect(await fetchSocketToken(vi.fn().mockResolvedValue(res(200, {})) as never)).toBeNull();
    expect(await fetchSocketToken(vi.fn().mockResolvedValue(res(500, {})) as never)).toBeNull();
  });
});
