// Admin pages call these (client-side). They hit the Next.js proxy, which attaches
// the backend JWT from the httpOnly cookie. The token is never exposed to JS.

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin-proxy${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export const adminGet = <T>(path: string) => call<T>('GET', path);
export const adminPost = <T>(path: string, body?: unknown) => call<T>('POST', path, body);
export const adminPatch = <T>(path: string, body?: unknown) => call<T>('PATCH', path, body);
export const adminDelete = <T>(path: string) => call<T>('DELETE', path);

export async function adminLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}
