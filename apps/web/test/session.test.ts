import { describe, it, expect, vi } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE, setSessionCookies, clearSessionCookies } from '../lib/session';

function store() {
  const set = vi.fn();
  return { set, calls: () => set.mock.calls as [string, string, Record<string, unknown>][] };
}

describe('setSessionCookies', () => {
  it('writes both httpOnly cookies with the secure flag and a 30d maxAge', () => {
    const s = store();
    setSessionCookies(s, 'acc', 'ref', true);
    const calls = s.calls();
    expect(calls[0][0]).toBe(ACCESS_COOKIE);
    expect(calls[0][1]).toBe('acc');
    expect(calls[0][2]).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30 });
    expect(calls[1][0]).toBe(REFRESH_COOKIE);
    expect(calls[1][1]).toBe('ref');
  });

  it('omits the refresh cookie when no refresh token is given', () => {
    const s = store();
    setSessionCookies(s, 'acc', undefined, false);
    const calls = s.calls();
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({ secure: false });
  });
});

describe('clearSessionCookies', () => {
  it('expires both cookies with maxAge 0', () => {
    const s = store();
    clearSessionCookies(s, true);
    const calls = s.calls();
    expect(calls.map((c) => c[0])).toEqual([ACCESS_COOKIE, REFRESH_COOKIE]);
    expect(calls.every((c) => c[1] === '' && c[2].maxAge === 0)).toBe(true);
  });
});
