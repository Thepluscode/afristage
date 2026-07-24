import { describe, it, expect, afterEach } from 'vitest';
import { socketOrigin } from '../lib/socket';

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
