import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, API_DEFAULT } from '../security-headers.mjs';
import { apiBase } from '../lib/live';

function connectSrc(csp: string): string[] {
  const directive = csp.split('; ').find((d) => d.startsWith('connect-src '));
  if (!directive) throw new Error('no connect-src directive');
  return directive.replace('connect-src ', '').split(' ');
}

// Observed on the deployed site 2026-09-23: `connect-src 'self'` and nothing
// else, so LiveKit, socket.io and the API were all blocked and a viewer on a
// LIVE room saw only "Could not join the stage." No test covered this file.
describe('content security policy — connect-src', () => {
  it('permits the API origin the app actually calls when the env var is unset', () => {
    // apiBase() is what lib/live.ts resolves to at runtime. The policy has to
    // permit THAT, not whatever this file independently thought the default was.
    const expected = new URL(apiBase()).origin;
    const sources = connectSrc(contentSecurityPolicy(undefined));

    expect(sources).toContain(expected);
    expect(sources).toContain(expected.replace(/^http/, 'ws'));
  });

  it('permits LiveKit, whose host only the API knows at runtime', () => {
    const sources = connectSrc(contentSecurityPolicy());
    expect(sources).toContain('wss://*.livekit.cloud');
    expect(sources).toContain('https://*.livekit.cloud');
  });

  it('carries no path on any source, which would restrict by path prefix', () => {
    // API_DEFAULT ends in /api. Passed through unstripped, `https://host/api`
    // permits only that prefix — wss://host/socket.io/ would still be blocked.
    for (const src of connectSrc(contentSecurityPolicy(API_DEFAULT))) {
      if (src.startsWith("'")) continue;
      expect(src.replace(/^[a-z]+:\/\//, '')).not.toContain('/');
    }
  });

  it('honours an explicit override', () => {
    const sources = connectSrc(contentSecurityPolicy('https://api.example.com/api/'));
    expect(sources).toContain('https://api.example.com');
    expect(sources).toContain('wss://api.example.com');
  });

  it('degrades to same-origin rather than throwing on a malformed base', () => {
    // This runs during `next build`; a bad variable must not take the build down.
    const sources = connectSrc(contentSecurityPolicy('not a url'));
    expect(sources).toContain("'self'");
    expect(sources.some((s) => s.includes('not a url'))).toBe(false);
  });

  it('still forbids third-party script origins', () => {
    // connect-src is being widened; script-src is the directive that closes the
    // compromised-CDN threat and must stay shut.
    expect(contentSecurityPolicy()).toContain("script-src 'self' 'unsafe-inline'");
    expect(contentSecurityPolicy()).toContain("object-src 'none'");
    expect(contentSecurityPolicy()).toContain("frame-ancestors 'none'");
  });
});
