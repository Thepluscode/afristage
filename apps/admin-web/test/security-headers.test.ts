import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs consumed by next.config.mjs, no types needed
import { contentSecurityPolicy, securityHeaders } from '../security-headers.mjs';

const API = 'https://api.example.com';

describe('contentSecurityPolicy', () => {
  it('refuses every origin by default', () => {
    expect(contentSecurityPolicy(API)).toContain("default-src 'self'");
  });

  it('allows no external script origin — the attack this exists to stop', () => {
    const scriptSrc = contentSecurityPolicy(API)
      .split('; ')
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline'");
    expect(scriptSrc).not.toMatch(/https?:\/\//);
  });

  it('never emits a wildcard source', () => {
    expect(contentSecurityPolicy(API)).not.toContain('*');
  });

  it('lets the app reach its own API over https and wss, and nothing else', () => {
    const connect = contentSecurityPolicy(API)
      .split('; ')
      .find((d) => d.startsWith('connect-src'));
    expect(connect).toBe(`connect-src 'self' ${API} wss://api.example.com`);
  });

  it('stays valid when the API base is unset — no empty or dangling source', () => {
    const connect = contentSecurityPolicy('')
      .split('; ')
      .find((d) => d.startsWith('connect-src'));
    expect(connect).toBe("connect-src 'self'");
  });

  it('tolerates a trailing slash on the configured API base', () => {
    expect(contentSecurityPolicy('https://api.example.com/')).toContain(`connect-src 'self' ${API} `);
  });

  it('blocks framing, plugins and base-tag hijacking', () => {
    const csp = contentSecurityPolicy(API);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});

describe('securityHeaders', () => {
  it('ships the CSP alongside the headers a CSP does not cover', () => {
    const keys = securityHeaders(API).map((h: { key: string }) => h.key);
    expect(keys).toEqual([
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy'
    ]);
  });
});
