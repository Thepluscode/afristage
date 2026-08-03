import { corsOrigin, parseOrigins } from './cors-origins';

const allow = (env: NodeJS.ProcessEnv, origin?: string): boolean => {
  let result = false;
  corsOrigin(env)(origin, (_err, ok) => {
    result = ok === true;
  });
  return result;
};

describe('parseOrigins', () => {
  it('splits, trims and drops empties', () => {
    expect(parseOrigins(' https://a.com , https://b.com ,, ')).toEqual(['https://a.com', 'https://b.com']);
  });

  it('normalises a trailing slash so a copy-pasted URL still matches', () => {
    expect(parseOrigins('https://a.com/')).toEqual(['https://a.com']);
  });

  it('treats missing config as no origins', () => {
    expect(parseOrigins(undefined)).toEqual([]);
  });
});

describe('corsOrigin', () => {
  const prod = { NODE_ENV: 'production', CORS_ORIGINS: 'https://admin.afristage.live,https://afristage.live' };

  it('allows a configured origin', () => {
    expect(allow(prod, 'https://admin.afristage.live')).toBe(true);
  });

  it('allows a configured origin sent with a trailing slash', () => {
    expect(allow(prod, 'https://afristage.live/')).toBe(true);
  });

  it('refuses an origin that was not configured', () => {
    expect(allow(prod, 'https://evil.example')).toBe(false);
  });

  it('refuses a lookalike subdomain', () => {
    expect(allow(prod, 'https://afristage.live.evil.example')).toBe(false);
  });

  it('allows requests with no Origin header — native apps and server-to-server', () => {
    expect(allow(prod, undefined)).toBe(true);
  });

  it('refuses everything cross-origin in production when nothing is configured', () => {
    expect(allow({ NODE_ENV: 'production' }, 'https://admin.afristage.live')).toBe(false);
  });

  it('falls back to localhost in development so the dev loop still works', () => {
    expect(allow({ NODE_ENV: 'development' }, 'http://localhost:3000')).toBe(true);
    expect(allow({ NODE_ENV: 'development' }, 'https://evil.example')).toBe(false);
  });
});
