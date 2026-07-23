// Client-side API helper. Everything authenticated flows through the same-origin
// /api/proxy route, which attaches the httpOnly access cookie server-side and
// refreshes on 401 — so the browser code here never touches a token.

export class ApiError extends Error {
  constructor(public status: number, message?: string) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

type Fetch = typeof fetch;

/** Call the backend through the auth proxy. Throws ApiError on a non-2xx response. */
export async function api<T = unknown>(path: string, opts: RequestInit = {}, doFetch: Fetch = fetch): Promise<T> {
  const res = await doFetch(`/api/proxy${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) }
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, (body as { message?: string } | null)?.message);
  }
  return body as T;
}
