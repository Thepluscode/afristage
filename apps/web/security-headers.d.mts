// security-headers.mjs is plain ESM because next.config.mjs imports it at build
// time. lib/live.ts imports API_DEFAULT from it so the app and its CSP cannot
// disagree about where the API is, and tsc needs these types to allow that.
export declare const API_DEFAULT: string;
export declare function contentSecurityPolicy(apiBase?: string): string;
export declare function securityHeaders(
  apiBase?: string
): Array<{ key: string; value: string }>;
