import { api } from './api';

export interface Gift {
  id: string;
  name: string;
  coinPrice: number;
  animationUrl?: string | null;
}

type Fetch = typeof fetch;

/** Public gift catalog — a guest can browse it before signing in (to entice the sign-up). */
export async function fetchGiftCatalog(base: string, doFetch: Fetch = fetch): Promise<Gift[]> {
  const res = await doFetch(`${base}/gifts`);
  if (!res.ok) return [];
  return (await res.json()) as Gift[];
}

/** Fresh idempotency key per send so a double-tap / retry can never double-charge. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Send a gift in a room (authed, via the proxy). Idempotent on idempotencyKey —
 * a retry with the same key returns the same transaction without re-charging.
 * Throws ApiError (401 = signed out, 4xx = business reject e.g. insufficient coins).
 */
export function sendGift(roomId: string, giftId: string, quantity: number, idempotencyKey: string, doFetch: Fetch = fetch) {
  return api(
    `/live-rooms/${roomId}/gifts`,
    { method: 'POST', body: JSON.stringify({ giftId, quantity, idempotencyKey }) },
    doFetch
  );
}
