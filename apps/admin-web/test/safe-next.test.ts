import { describe, expect, it } from 'vitest';
import { safeNext } from '../lib/safe-next';

describe('safeNext (open-redirect guard for post-login return path)', () => {
  it('defaults to / for null/undefined/empty', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('')).toBe('/');
  });

  it('allows a same-origin relative path, preserving query', () => {
    expect(safeNext('/payouts')).toBe('/payouts');
    expect(safeNext('/payouts?status=HELD')).toBe('/payouts?status=HELD');
  });

  it('blocks protocol-relative //host (open redirect)', () => {
    expect(safeNext('//evil.com')).toBe('/');
  });

  it('blocks the backslash trick /\\host (browsers resolve as //)', () => {
    expect(safeNext('/\\evil.com')).toBe('/');
  });

  it('blocks absolute URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('http://x')).toBe('/');
  });

  it('blocks a value that does not start with a slash', () => {
    expect(safeNext('evil')).toBe('/');
  });

  it('does not bounce back to the login page', () => {
    expect(safeNext('/login')).toBe('/');
    expect(safeNext('/login?next=/x')).toBe('/');
    expect(safeNext('/login/foo')).toBe('/');
  });
});
