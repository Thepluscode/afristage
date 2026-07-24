// Data/decision layer for the guest viewer — kept pure and fetch-injectable so it
// is fully unit-testable without a browser or the LiveKit SDK. The Viewer
// component is a thin wiring shell over these functions.

const API_DEFAULT = 'https://api-production-e12f.up.railway.app/api';

/** Resolve the API base: explicit override → NEXT_PUBLIC_API_BASE → staging default, trailing slash stripped. */
export function apiBase(override?: string | null): string {
  const raw = override || process.env.NEXT_PUBLIC_API_BASE || API_DEFAULT;
  return raw.replace(/\/+$/, '');
}

/** Shape of the public guest-token response (POST /live-rooms/:id/guest-token). */
export interface GuestToken {
  viewerToken: string;
  livekitUrl: string;
  roomStatus: string;
}

type Fetch = typeof fetch;

/**
 * Pick a room to watch: an explicit id wins; otherwise discover the first LIVE
 * room from the public listing. Returns null when nothing is live or the listing
 * is unreachable (the caller shows a friendly "no stages live" state).
 */
export async function resolveLiveRoomId(base: string, explicit?: string | null, doFetch: Fetch = fetch): Promise<string | null> {
  if (explicit) return explicit;
  const res = await doFetch(`${base}/live-rooms`);
  if (!res.ok) return null;
  const body = await res.json();
  const list: Array<{ id?: string; status?: string; livekitRoomName?: string }> = Array.isArray(body)
    ? body
    : (body?.data ?? body?.rooms ?? []);
  const live = list.find((r) => r.status === 'LIVE' && (r.livekitRoomName || r.id));
  return live?.id ?? null;
}

/** Fetch a public view-only guest token for a room. Returns null if the room isn't live / unreachable. */
export async function fetchGuestToken(base: string, roomId: string, doFetch: Fetch = fetch): Promise<GuestToken | null> {
  const res = await doFetch(`${base}/live-rooms/${roomId}/guest-token`, { method: 'POST' });
  if (!res.ok) return null;
  return (await res.json()) as GuestToken;
}

export interface RoomInfo {
  id: string;
  title: string;
  status: string;
  viewerCount: number;
  host?: { id: string; profile?: { displayName?: string; avatarUrl?: string | null } | null } | null;
}

/** Public room metadata for the streamer header (host, title, initial viewer count). */
export async function fetchRoom(base: string, roomId: string, doFetch: Fetch = fetch): Promise<RoomInfo | null> {
  const res = await doFetch(`${base}/live-rooms/${roomId}`);
  if (!res.ok) return null;
  return (await res.json()) as RoomInfo;
}

export interface TopGifter {
  rank: number;
  displayName: string;
  totalCoins: number;
}

/** Public top-supporters leaderboard for a room (ranked by coins gifted). */
export async function fetchTopGifters(base: string, roomId: string, doFetch: Fetch = fetch): Promise<TopGifter[]> {
  const res = await doFetch(`${base}/live-rooms/${roomId}/top-gifters`);
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ rank?: number; displayName?: string | null; totalCoins?: number }>;
  return rows.map((r, i) => ({ rank: r.rank ?? i + 1, displayName: r.displayName || 'Supporter', totalCoins: r.totalCoins ?? 0 }));
}
