'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Download,
  Gift,
  Headset,
  Landmark,
  LifeBuoy,
  MonitorPlay,
  Radio,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  Wallet
} from 'lucide-react';
import { adminGet, adminPost } from '../lib/api';
import { toCsv } from '../lib/csv';
import {
  AlertCard,
  AuditTimeline,
  ConfirmDialog,
  DangerBanner,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  Pagination,
  PriorityBadge,
  PromptDialog,
  QuickActions,
  RoomCell,
  StatusBadge,
  SuccessBanner,
  UserCell,
  WarningBanner
} from './admin-ui';
import type { MetricAccent } from './admin-ui';
import { Sparkline } from './Sparkline';

type Integrity = { ok: boolean; unbalancedTransactions: number };
type SeriesPoint = {
  day: string;
  newUsers: number;
  giftCount: number;
  giftVolumeCoins: number;
  newRooms?: number;
  newCreators?: number;
};

type Room = {
  id: string;
  title: string;
  status: string;
  category: string;
  country?: string;
  reportsCount?: number;
  /** Gross gift revenue for the room, in COINS (not minor fiat units). */
  giftCoins?: number;
  peakViewers: number;
  startedAt?: string | null;
  host?: { profile?: { displayName?: string }; creatorProfile?: { stageName?: string } };
};

type Report = {
  id: string;
  priority: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter?: { profile?: { username?: string; displayName?: string } };
  targetUser?: { profile?: { username?: string } };
  room?: { title?: string };
};

type Payout = {
  id: string;
  coinAmount: string | number;
  status: string;
  createdAt: string;
  creatorUserId: string;
  creator?: { profile?: { displayName?: string }; creatorProfile?: { stageName?: string } };
};

type TabKey = 'rooms' | 'reports' | 'payouts';

type Dashboard = {
  activeRooms: number;
  pendingReports: number;
  criticalReports: number;
  pendingPayouts: number;
  successfulPayments: number;
  failedPayments: number;
  grossGiftVolumeCoins: number | string;
  newUsersToday: number;
  newCreatorsToday: number;
  pendingCreatorApprovals?: number;
  openSupportTickets?: number;
};

/** Day-over-day change as a signed percentage, or null when it cannot be stated
 *  honestly (no prior day, or a prior day of zero — which has no percentage). */
function dayOverDay(values: number[]): string | null {
  if (values.length < 2) return null;
  const today = values[values.length - 1];
  const yesterday = values[values.length - 2];
  if (yesterday === 0) return null;
  const pct = ((today - yesterday) / yesterday) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** "2m ago" / "3h ago" / "5d ago". Undefined timestamps render as an em dash. */
function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  // null = still loading, 'error' = the optional fetch failed. Both must be
  // distinguishable from an empty list, or the table claims "no rooms" (or
  // spins forever) when it simply could not ask.
  const [rooms, setRooms] = useState<Room[] | 'error' | null>(null);
  const [reports, setReports] = useState<Report[] | 'error' | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | 'error' | null>(null);
  const [tab, setTab] = useState<TabKey>('rooms');
  const [category, setCategory] = useState('');
  const [rowStatus, setRowStatus] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Named so an action can refresh just the queue it touched.
  const loadRooms = useCallback(
    () =>
      adminGet<Room[]>('/admin/live-rooms')
        .then(setRooms)
        .catch((e) => {
          console.warn('Optional live-rooms table failed to load', e);
          setRooms('error');
        }),
    []
  );
  const loadReports = useCallback(
    () =>
      adminGet<Report[]>('/admin/reports')
        .then(setReports)
        .catch((e) => {
          console.warn('Optional reports tab failed to load', e);
          setReports('error');
        }),
    []
  );

  /** Runs a row mutation, then refreshes that queue. A failure is surfaced in the
   *  panel rather than swallowed — the operator must know the action did not land. */
  async function runAction(label: string, fn: () => Promise<unknown>, reload: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(`${label} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  useEffect(() => {
    adminGet<Dashboard>('/admin/dashboard').then(setData).catch((e) => setError(e.message));
    adminGet<Integrity>('/admin/ledger/integrity').then(setIntegrity).catch((e) => {
      console.warn('Optional ledger integrity widget failed to load', e);
    });
    adminGet<SeriesPoint[]>('/admin/analytics/series?days=30').then(setSeries).catch((e) => {
      console.warn('Optional analytics series widget failed to load', e);
    });
    loadRooms();
    loadReports();
    adminGet<Payout[]>('/admin/payouts').then(setPayouts).catch((e) => {
      console.warn('Optional payouts tab failed to load', e);
      setPayouts('error');
    });
  }, [loadRooms, loadReports]);

  if (error) return <ErrorState error={error} />;
  if (!data) return <LoadingState label="Loading operations dashboard…" />;

  const userSeries = series?.map((p) => p.newUsers) ?? [];
  const giftSeries = series?.map((p) => p.giftVolumeCoins) ?? [];
  const roomSeries = series?.map((p) => p.newRooms ?? 0) ?? [];
  const creatorSeries = series?.map((p) => p.newCreators ?? 0) ?? [];
  const last = (v: number[]) => (v.length ? v[v.length - 1] : 0);

  const cards: {
    label: string;
    value: string | number;
    tone: 'good' | 'warn' | 'danger' | 'neutral';
    delta: string;
    icon: ReactNode;
    accent: MetricAccent;
    trend?: number[];
    trendLabel?: string;
  }[] = [
    // NOTE ON TRENDS: a "vs yesterday" delta only means something for a FLOW
    // (rooms opened today, users joined today). The backlog counters below —
    // open reports, pending payouts, support queue — are point-in-time state, so
    // they deliberately carry no delta; one would read as a rate and mislead.
    {
      label: 'Rooms opened today',
      value: last(roomSeries),
      tone: last(roomSeries) > 0 ? 'good' : 'neutral',
      delta: `${data.activeRooms} live now`,
      icon: <MonitorPlay />,
      accent: 'teal',
      trend: roomSeries,
      trendLabel: dayOverDay(roomSeries) ?? undefined
    },
    {
      label: 'Creators joined today',
      value: last(creatorSeries),
      tone: 'neutral',
      delta: `${data.pendingCreatorApprovals ?? 0} awaiting approval`,
      icon: <UserPlus />,
      accent: 'purple',
      trend: creatorSeries,
      trendLabel: dayOverDay(creatorSeries) ?? undefined
    },
    { label: 'Critical reports', value: data.criticalReports, tone: data.criticalReports > 0 ? 'danger' : 'good', delta: 'Moderation priority', icon: <ShieldAlert />, accent: 'danger' },
    { label: 'Pending payouts', value: data.pendingPayouts, tone: data.pendingPayouts > 0 ? 'warn' : 'good', delta: 'Money movement', icon: <Landmark />, accent: 'gold' },
    { label: 'Open support', value: data.openSupportTickets ?? 0, tone: (data.openSupportTickets ?? 0) > 0 ? 'warn' : 'good', delta: 'User backlog', icon: <LifeBuoy />, accent: 'teal' },
    { label: 'Failed payments', value: data.failedPayments, tone: data.failedPayments > 0 ? 'danger' : 'good', delta: 'Provider risk', icon: <CreditCard />, accent: 'danger' },
    {
      // Today's flow, not the all-time gross — the value and its "vs yesterday"
      // delta must describe the same quantity. Gross lives in Live economy.
      label: 'Gift volume today',
      value: `${last(giftSeries).toLocaleString()} COIN`,
      tone: 'neutral',
      delta: `${Number(data.grossGiftVolumeCoins).toLocaleString()} all time`,
      icon: <Gift />,
      accent: 'gold',
      trend: giftSeries,
      trendLabel: dayOverDay(giftSeries) ?? undefined
    },
    {
      label: 'New users today',
      value: data.newUsersToday,
      tone: 'neutral',
      delta: 'Growth pulse',
      icon: <Users />,
      accent: 'green',
      trend: userSeries,
      trendLabel: dayOverDay(userSeries) ?? undefined
    }
  ];
  const auditSeed = [
    { action: 'dashboard.viewed', actorId: 'system', createdAt: new Date().toISOString() },
    { action: data.criticalReports > 0 ? 'reports.priority' : 'reports.normal', actorId: 'ops', createdAt: new Date().toISOString() },
    { action: data.failedPayments > 0 ? 'payments.failed' : 'payments.normal', actorId: 'ops', createdAt: new Date().toISOString() }
  ];

  // Live first, then the noisiest — the rooms an operator would open next.
  // Records without an id cannot be linked or keyed, so they are dropped rather
  // than rendered half-broken (never trust the shape of an API response).
  const allRoomRows = (Array.isArray(rooms) ? rooms : [])
    .filter((r): r is Room => typeof r?.id === 'string')
    .filter((r) => (!category || r.category === category) && (!rowStatus || r.status === rowStatus))
    .sort(
      (a, b) =>
        Number(b.status === 'LIVE') - Number(a.status === 'LIVE') ||
        (b.reportsCount ?? 0) - (a.reportsCount ?? 0) ||
        b.peakViewers - a.peakViewers
    );

  const allReportRows = (Array.isArray(reports) ? reports : [])
    .filter((r): r is Report => typeof r?.id === 'string')
    .filter((r) => !rowStatus || r.status === rowStatus);

  const allPayoutRows = (Array.isArray(payouts) ? payouts : [])
    .filter((p): p is Payout => typeof p?.id === 'string')
    .filter((p) => !rowStatus || p.status === rowStatus);

  const PAGE_SIZE = 10;
  // Clamp rather than store a corrected page: filtering down while on page 5
  // would otherwise render an empty table until the operator clicked something.
  const pageOf = (rows: unknown[]) => Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const paged = <T,>(rows: T[]) => rows.slice((pageOf(rows) - 1) * PAGE_SIZE, pageOf(rows) * PAGE_SIZE);

  const roomRows = paged(allRoomRows);
  const reportRows = paged(allReportRows);
  const payoutRows = paged(allPayoutRows);

  // Category options come from the data actually present, so the filter can
  // never offer a value that matches nothing.
  const categories = [...new Set((Array.isArray(rooms) ? rooms : []).map((r) => r.category).filter(Boolean))].sort();
  const statuses = [
    ...new Set(
      tab === 'rooms'
        ? (Array.isArray(rooms) ? rooms : []).map((r) => r.status)
        : tab === 'reports'
          ? (Array.isArray(reports) ? reports : []).map((r) => r.status)
          : (Array.isArray(payouts) ? payouts : []).map((p) => p.status)
    )
  ]
    .filter(Boolean)
    .sort();

  const activeSource = tab === 'rooms' ? rooms : tab === 'reports' ? reports : payouts;
  const totalCount =
    tab === 'rooms' ? allRoomRows.length : tab === 'reports' ? allReportRows.length : allPayoutRows.length;

  /** Exports every filtered row, not just the six shown — the table is a preview,
   *  the export is the working set. */
  function exportCsv() {
    const [headers, body]: [string[], unknown[][]] =
      tab === 'rooms'
        ? [
            ['Room', 'Creator', 'Category', 'Status', 'Viewers', 'Gift coins', 'Reports', 'Started'],
            allRoomRows.map((r) => [
              r.title,
              r.host?.creatorProfile?.stageName || r.host?.profile?.displayName || '',
              r.category,
              r.status,
              r.peakViewers,
              r.giftCoins ?? 0,
              r.reportsCount ?? 0,
              r.startedAt ?? ''
            ])
          ]
        : tab === 'reports'
          ? [
              ['Reported', 'Reason', 'Priority', 'Status', 'Created'],
              allReportRows.map((r) => [
                r.room?.title || r.targetUser?.profile?.username || '',
                r.reason,
                r.priority,
                r.status,
                r.createdAt
              ])
            ]
          : [
              ['Creator', 'Coins', 'Status', 'Created'],
              allPayoutRows.map((p) => [
                p.creator?.creatorProfile?.stageName || p.creator?.profile?.displayName || p.creatorUserId,
                p.coinAmount,
                p.status,
                p.createdAt
              ])
            ];

    const blob = new Blob([toCsv(headers, body)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `afristage-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function emptyLabel(source: typeof activeSource, noun: string) {
    if (source === null) return `Loading ${noun}…`;
    if (source === 'error') return `Could not load ${noun} — open the ${noun} page to retry.`;
    return totalCount === 0 && (category || rowStatus) ? 'No rows match these filters.' : `No ${noun} yet.`;
  }

  return (
    <>
      <PageHeader
        title="Mission Control"
        kicker="Live room health, moderation pressure, payout risk, support load, and platform growth in one control surface."
        action={
          <div className="header-actions">
            <Link className="button secondary" href="/analytics">Analytics</Link>
            <Link className="button" href="/reports">Review reports</Link>
          </div>
        }
      />
      <div className="alert-row">
        <AlertCard
          tone={data.criticalReports > 0 ? 'danger' : 'good'}
          icon={data.criticalReports > 0 ? <AlertTriangle /> : <CheckCircle2 />}
          title="Critical reports"
          value={data.criticalReports}
          note={data.criticalReports > 0 ? 'need immediate review' : 'no critical reports open'}
          href="/reports"
          action="Review now"
        />
        <AlertCard
          tone={data.pendingPayouts > 0 ? 'warn' : 'good'}
          icon={<Wallet />}
          title="Pending payouts"
          value={data.pendingPayouts}
          note={data.pendingPayouts > 0 ? 'awaiting audit-friendly review' : 'no payouts awaiting review'}
          href="/payouts"
          action="Review"
        />
        <AlertCard
          tone={integrity && !integrity.ok ? 'danger' : 'good'}
          icon={integrity && !integrity.ok ? <AlertTriangle /> : <CheckCircle2 />}
          title={integrity && !integrity.ok ? 'Ledger imbalance' : 'Ledger balanced'}
          value={integrity ? (integrity.ok ? 'Balanced' : `${integrity.unbalancedTransactions} off`) : '…'}
          note={integrity && !integrity.ok ? 'unbalanced transactions detected' : 'all transactions reconciled'}
          href="/ledger-integrity"
          action="View ledger"
        />
      </div>
      {data.criticalReports > 0 || data.failedPayments > 0 ? (
        <DangerBanner>
          {data.criticalReports} critical report(s) and {data.failedPayments} failed payment(s) need operator review.
        </DangerBanner>
      ) : data.pendingPayouts > 0 ? (
        <WarningBanner>{data.pendingPayouts} payout request(s) need audit-friendly review before money moves.</WarningBanner>
      ) : (
        <SuccessBanner>Ledger, reports, payouts, and payment queues are inside normal operating range.</SuccessBanner>
      )}
      <div className="metric-grid mission-metrics">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>
      <div className="command-grid">
        <section className="ops-main">
          <section className="side-panel queue-panel">
            <div className="table-tabs" role="tablist" aria-label="Operations queues">
              {(
                [
                  ['rooms', 'Live Rooms'],
                  ['reports', 'Reports'],
                  ['payouts', 'Payouts']
                ] as [TabKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  id={`tab-${key}`}
                  aria-selected={tab === key}
                  aria-controls="queue-panel"
                  className={tab === key ? 'table-tab on' : 'table-tab'}
                  onClick={() => {
                    setTab(key);
                    // Status values are per-queue; carrying one across tabs would
                    // silently filter everything out.
                    setRowStatus('');
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
              <Link className="tab-link" href={tab === 'rooms' ? '/live-rooms' : tab === 'reports' ? '/reports' : '/payouts'}>
                Open all →
              </Link>
            </div>

            <div className="table-filters">
              {tab === 'rooms' ? (
                <label>
                  <span>Category</span>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                <span>Status</span>
                <select
                  value={rowStatus}
                  onChange={(e) => {
                    setRowStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="table-filter-actions">
                {/* The count lives in the pagination footer; this only reports
                    the empty case, where the footer renders nothing. */}
                {totalCount === 0 ? <span className="muted">No rows</span> : null}
                <button type="button" className="button secondary" onClick={exportCsv} disabled={totalCount === 0}>
                  <Download size={15} /> Export
                </button>
              </div>
            </div>

            <div className="ops-table" id="queue-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {tab === 'rooms' ? (
                <table>
                  <thead>
                    <tr>
                      <th>Room / Creator</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Viewers</th>
                      <th>Revenue</th>
                      <th>Reports</th>
                      <th>Last active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="muted">{emptyLabel(rooms, 'live rooms')}</td>
                      </tr>
                    ) : (
                      roomRows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <RoomCell
                              title={r.title}
                              sub={r.host?.creatorProfile?.stageName || r.host?.profile?.displayName || r.id.slice(0, 8)}
                            />
                          </td>
                          <td>{r.category ? <span className="pill creator">{r.category}</span> : '—'}</td>
                          <td><StatusBadge status={r.status} /></td>
                          <td>
                            <span className={r.status === 'LIVE' ? 'viewer-count live' : 'viewer-count'}>
                              {r.peakViewers.toLocaleString()}
                            </span>
                          </td>
                          <td>
                            {/* COINS, not minor fiat units — see GiftTransaction. */}
                            <span className="revenue-cell">
                              <Gift size={13} /> {(r.giftCoins ?? 0).toLocaleString()}
                            </span>
                          </td>
                          <td>
                            {/* A pill draws the eye — reserve it for rooms that
                                actually carry reports; zero stays quiet. */}
                            {(r.reportsCount ?? 0) > 0 ? (
                              <span className="pill warning">{r.reportsCount}</span>
                            ) : (
                              <span className="muted">0</span>
                            )}
                          </td>
                          <td className="muted">{relativeTime(r.startedAt)}</td>
                          <td>
                            <div className="row-actions">
                              <ConfirmDialog
                                title="Suspend room"
                                triggerLabel="Suspend"
                                body={`Suspend "${r.title}" immediately? This removes the room from live operation.`}
                                confirmLabel="Suspend"
                                disabled={r.status === 'SUSPENDED'}
                                onConfirm={() =>
                                  runAction('Suspend', () => adminPost(`/admin/live-rooms/${r.id}/suspend`, { reason: 'admin takedown' }), loadRooms)
                                }
                              />
                              <ConfirmDialog
                                title="End room"
                                triggerLabel="End"
                                body={`Force-end "${r.title}"? This stops the stream for every viewer.`}
                                confirmLabel="End"
                                disabled={r.status !== 'LIVE'}
                                onConfirm={() => runAction('End', () => adminPost(`/admin/live-rooms/${r.id}/end`), loadRooms)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : tab === 'reports' ? (
                <table>
                  <thead>
                    <tr>
                      <th>Reported</th>
                      <th>Reason</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Raised</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">{emptyLabel(reports, 'reports')}</td>
                      </tr>
                    ) : (
                      reportRows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <RoomCell
                              title={r.room?.title || r.targetUser?.profile?.username || 'Unknown target'}
                              sub={r.reporter?.profile?.displayName || r.reporter?.profile?.username || ''}
                            />
                          </td>
                          <td>{r.reason}</td>
                          <td><PriorityBadge priority={r.priority} /></td>
                          <td><StatusBadge status={r.status} /></td>
                          <td className="muted">{relativeTime(r.createdAt)}</td>
                          <td>
                            <div className="row-actions">
                              <PromptDialog
                                triggerLabel="Review"
                                triggerClassName="button secondary"
                                title="Review report"
                                inputLabel="Reason"
                                placeholder="Optional note"
                                confirmLabel="Review"
                                onSubmit={(reason) =>
                                  runAction('Review', () => adminPost(`/admin/reports/${r.id}/action`, { action: 'REVIEWING', reason: reason || 'REVIEWING' }), loadReports)
                                }
                              />
                              <PromptDialog
                                triggerLabel="Escalate"
                                danger
                                title="Escalate report"
                                inputLabel="Reason"
                                placeholder="Why escalate?"
                                confirmLabel="Escalate"
                                onSubmit={(reason) =>
                                  runAction('Escalate', () => adminPost(`/admin/reports/${r.id}/action`, { action: 'ESCALATE', reason: reason || 'ESCALATE' }), loadReports)
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Creator</th>
                      <th>Coins</th>
                      <th>Status</th>
                      <th>Requested</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted">{emptyLabel(payouts, 'payouts')}</td>
                      </tr>
                    ) : (
                      payoutRows.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <UserCell
                              name={p.creator?.creatorProfile?.stageName || p.creator?.profile?.displayName}
                              sub={p.creatorUserId}
                            />
                          </td>
                          <td className="viewer-count">{Number(p.coinAmount).toLocaleString()}</td>
                          <td><StatusBadge status={p.status} /></td>
                          <td className="muted">{relativeTime(p.createdAt)}</td>
                          <td>
                            {/* Money movement is not actioned from a preview
                                panel: approving a payout needs the ledger
                                check, fraud score and destination masking that
                                only the payouts page shows. */}
                            <Link className="button secondary" href={`/payouts?id=${p.id}`}>
                              Review
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {actionError ? <p className="source-cap" role="alert">{actionError}</p> : null}
            {activeSource !== 'error' && Array.isArray(activeSource) && activeSource.length >= 100 ? (
              <p className="source-cap">
                Showing the most recent 100 records — open the full page for older history.
              </p>
            ) : null}
            <Pagination
              page={pageOf(tab === 'rooms' ? allRoomRows : tab === 'reports' ? allReportRows : allPayoutRows)}
              pageSize={PAGE_SIZE}
              total={totalCount}
              onPage={setPage}
              noun={tab === 'rooms' ? 'rooms' : tab === 'reports' ? 'reports' : 'payouts'}
            />
          </section>
          {series && series.length > 0 ? (
            <div className="insight-grid">
              <section className="side-panel">
                <h3>Growth (30 days)</h3>
                <Sparkline label="New users / day" values={userSeries} accent="#14b8a6" />
                <Sparkline label="Gift volume (coins) / day" values={giftSeries} accent="#ffc857" />
                <Sparkline label="Rooms opened / day" values={roomSeries} accent="#a78bfa" />
                <Sparkline label="Creators joined / day" values={creatorSeries} accent="#22c55e" />
              </section>
              <section className="side-panel">
                <h3>Live economy</h3>
                <div className="bar-list">
                  <BarRow label="Gift volume" value={Number(data.grossGiftVolumeCoins) || 0} max={Math.max(Number(data.grossGiftVolumeCoins) || 0, 1)} />
                  <BarRow label="Successful payments" value={data.successfulPayments} max={Math.max(data.successfulPayments + data.failedPayments, 1)} />
                  <BarRow label="Failed payments" value={data.failedPayments} max={Math.max(data.successfulPayments + data.failedPayments, 1)} danger />
                </div>
              </section>
            </div>
          ) : null}
        </section>
        <aside className="ops-sidebar">
          <section className="side-panel">
            <h3>Quick actions</h3>
            <QuickActions
              actions={[
                { label: 'Approve creators', href: '/creators', tone: 'teal', icon: <UserCheck /> },
                { label: 'Suspend a room', href: '/live-rooms', tone: 'danger', icon: <ShieldAlert /> },
                { label: 'Go live search', href: '/live-rooms', tone: 'gold', icon: <Radio /> },
                { label: 'Support queue', href: '/support', tone: 'purple', icon: <Headset /> }
              ]}
            />
          </section>
          <section className={`side-panel risk-card ${data.pendingPayouts > 0 || data.failedPayments > 0 ? 'risk' : ''}`}>
            <h3>Payout risk overview</h3>
            <div className="risk-score">{data.pendingPayouts + data.failedPayments}</div>
            <p>{data.pendingPayouts > 0 || data.failedPayments > 0 ? 'Money movement needs review before approvals.' : 'No payout or payment blocker detected.'}</p>
            <Link className="button secondary" href="/payouts">Review payouts</Link>
          </section>
          <section className={`side-panel ${integrity && !integrity.ok ? 'risk' : ''}`}>
            <h3>Ledger status</h3>
            <p>{integrity ? (integrity.ok ? 'Balanced across transaction entries.' : `${integrity.unbalancedTransactions} transaction(s) out of balance.`) : 'Checking ledger integrity…'}</p>
            <Link className="button secondary" href="/ledger-integrity">Open ledger</Link>
          </section>
          <AuditTimeline rows={auditSeed} />
        </aside>
      </div>
    </>
  );
}

function BarRow({ label, value, max, danger = false }: { label: string; value: number; max: number; danger?: boolean }) {
  const width = Math.max(6, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="bar-row">
      <div>
        <strong>{label}</strong>
        <span>{value.toLocaleString()}</span>
      </div>
      <div className="bar-track"><span className={danger ? 'danger' : ''} style={{ width: `${width}%` }} /></div>
    </div>
  );
}
