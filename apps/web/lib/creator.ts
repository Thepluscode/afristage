// Creator earnings data + formatting. The API already exposes everything; this
// just fetches through the auth proxy and formats for the read-only /earnings
// view. Diamonds (💎) are the creator earning unit (mirrors mobile #206) — a coin
// count; fiat() renders the same balance's published cash-out value.

import { api } from './api';

type Fetch = typeof fetch;

export interface TopSupporter {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
}

export interface CreatorDashboard {
  earnings: string; // EARNING balance = available 💎
  totalGiftTransactions: number;
  totalRooms: number;
  followers: number;
  totalWatchSeconds: string | number;
  topSupporters: TopSupporter[];
  payoutRate: number; // fiat minor units per 💎
  payoutCurrency: string; // ISO code, e.g. NGN
}

export interface Payout {
  id: string;
  coinAmount: string | number;
  status: string;
  createdAt: string;
}

export interface EarningsView {
  dashboard: CreatorDashboard;
  availableDiamonds: number; // spendable-to-cash-out 💎
  pendingDiamonds: number; // held in an in-flight payout
  payouts: Payout[];
}

/** Grouped 💎 count (no currency symbol). */
export function diamonds(n: string | number): string {
  return Math.round(Math.abs(Number(n)))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Published cash-out value of a 💎 amount: rate is fiat *minor* units per 💎. */
export function fiat(coins: string | number, rate: number, currency: string): string {
  const major = (Number(coins) * rate) / 100;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
}

/** Whole watch-time hours, one decimal (e.g. "12.5h"). */
export function watchHours(seconds: string | number): string {
  return `${(Number(seconds) / 3600).toFixed(1)}h`;
}

/**
 * Load the creator's earnings view. Throws ApiError — the page maps 401 → login,
 * 403/404 → "not a creator", anything else → a generic error.
 */
export async function fetchEarnings(doFetch: Fetch = fetch): Promise<EarningsView> {
  const [dashboard, wallet, payouts] = await Promise.all([
    api<CreatorDashboard>('/creators/me/dashboard', {}, doFetch),
    api<{ earningBalance: string; payoutHoldBalance: string }>('/wallet/me', {}, doFetch),
    api<Payout[]>('/payouts/me', {}, doFetch)
  ]);
  return {
    dashboard,
    availableDiamonds: Number(wallet.earningBalance),
    pendingDiamonds: Number(wallet.payoutHoldBalance),
    payouts
  };
}
