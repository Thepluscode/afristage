'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CreditCard, Gift, Landmark, LifeBuoy, MonitorPlay, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { adminGet } from '../lib/api';
import { AlertCard, AuditTimeline, DangerBanner, ErrorState, LoadingState, MetricCard, PageHeader, SuccessBanner, WarningBanner } from './admin-ui';
import { Sparkline } from './Sparkline';

type Integrity = { ok: boolean; unbalancedTransactions: number };
type SeriesPoint = { day: string; newUsers: number; giftCount: number; giftVolumeCoins: number };

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

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Dashboard>('/admin/dashboard').then(setData).catch((e) => setError(e.message));
    adminGet<Integrity>('/admin/ledger/integrity').then(setIntegrity).catch((e) => {
      console.warn('Optional ledger integrity widget failed to load', e);
    });
    adminGet<SeriesPoint[]>('/admin/analytics/series?days=30').then(setSeries).catch((e) => {
      console.warn('Optional analytics series widget failed to load', e);
    });
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!data) return <LoadingState label="Loading operations dashboard…" />;

  const cards: {
    label: string;
    value: string | number;
    tone: 'good' | 'warn' | 'danger' | 'neutral';
    delta: string;
    icon: ReactNode;
  }[] = [
    { label: 'Active rooms', value: data.activeRooms, tone: data.activeRooms > 0 ? 'good' : 'neutral', delta: 'Live capacity', icon: <MonitorPlay /> },
    { label: 'Creator approvals', value: data.pendingCreatorApprovals ?? data.newCreatorsToday, tone: (data.pendingCreatorApprovals ?? 0) > 0 ? 'warn' : 'neutral', delta: 'Pending review', icon: <UserPlus /> },
    { label: 'Critical reports', value: data.criticalReports, tone: data.criticalReports > 0 ? 'danger' : 'good', delta: 'Moderation priority', icon: <ShieldAlert /> },
    { label: 'Pending payouts', value: data.pendingPayouts, tone: data.pendingPayouts > 0 ? 'warn' : 'good', delta: 'Money movement', icon: <Landmark /> },
    { label: 'Open support', value: data.openSupportTickets ?? 0, tone: (data.openSupportTickets ?? 0) > 0 ? 'warn' : 'good', delta: 'User backlog', icon: <LifeBuoy /> },
    { label: 'Failed payments', value: data.failedPayments, tone: data.failedPayments > 0 ? 'danger' : 'good', delta: 'Provider risk', icon: <CreditCard /> },
    { label: 'Gift volume', value: `${data.grossGiftVolumeCoins} COIN`, tone: 'neutral', delta: 'Gross beta support', icon: <Gift /> },
    { label: 'New users today', value: data.newUsersToday, tone: 'neutral', delta: 'Growth pulse', icon: <Users /> }
  ];
  const auditSeed = [
    { action: 'dashboard.viewed', actorId: 'system', createdAt: new Date().toISOString() },
    { action: data.criticalReports > 0 ? 'reports.priority' : 'reports.normal', actorId: 'ops', createdAt: new Date().toISOString() },
    { action: data.failedPayments > 0 ? 'payments.failed' : 'payments.normal', actorId: 'ops', createdAt: new Date().toISOString() }
  ];

  return (
    <>
      <PageHeader
        title="Operations Dashboard"
        kicker="Mission control for live room health, moderation pressure, payout risk, support load, and platform growth."
        action={
          <div className="header-actions">
            <button className="button secondary" type="button">Today</button>
            <button className="button secondary" type="button">Export</button>
            <a className="button" href="/reports">Quick action</a>
          </div>
        }
      />
      <div className="alert-row">
        <AlertCard
          tone={data.criticalReports > 0 ? 'danger' : 'good'}
          title="Critical reports"
          value={data.criticalReports}
          note={data.criticalReports > 0 ? 'High-priority reports need review' : 'No critical reports open'}
          href="/reports"
          action="Review"
        />
        <AlertCard
          tone={data.pendingPayouts > 0 ? 'warn' : 'good'}
          title="Pending payouts"
          value={data.pendingPayouts}
          note={data.pendingPayouts > 0 ? 'Awaiting audit-friendly review' : 'No payouts awaiting review'}
          href="/payouts"
          action="Review"
        />
        <AlertCard
          tone={integrity && !integrity.ok ? 'danger' : 'good'}
          title={integrity && !integrity.ok ? 'Ledger imbalance' : 'Ledger balanced'}
          value={integrity ? (integrity.ok ? 'Balanced' : `${integrity.unbalancedTransactions} off`) : '…'}
          note={integrity && !integrity.ok ? 'Unbalanced transactions detected' : 'All transactions reconciled'}
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
      <div className="command-grid">
        <section className="ops-main">
          <div className="metric-grid">
            {cards.map((card) => (
              <MetricCard key={card.label} {...card} />
            ))}
          </div>
          <section className="side-panel queue-panel">
            <div className="panel-head">
              <div>
                <h3>Moderation and money queue</h3>
                <p>Clear critical safety and payout work before routine review.</p>
              </div>
              <a href="/reports">Open reports →</a>
            </div>
            <div className="ops-table">
              <table>
                <thead>
                  <tr>
                    <th>Queue</th>
                    <th>Volume</th>
                    <th>Risk</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Critical reports</strong><small>Room and user safety</small></td>
                    <td>{data.criticalReports}</td>
                    <td><span className={`pill ${data.criticalReports > 0 ? 'danger' : 'success'}`}>{data.criticalReports > 0 ? 'Hot' : 'Clear'}</span></td>
                    <td>Trust ops</td>
                  </tr>
                  <tr>
                    <td><strong>Pending payouts</strong><small>Creator money movement</small></td>
                    <td>{data.pendingPayouts}</td>
                    <td><span className={`pill ${data.pendingPayouts > 0 ? 'warning' : 'success'}`}>{data.pendingPayouts > 0 ? 'Review' : 'Clear'}</span></td>
                    <td>Finance</td>
                  </tr>
                  <tr>
                    <td><strong>Failed payments</strong><small>Provider or checkout failures</small></td>
                    <td>{data.failedPayments}</td>
                    <td><span className={`pill ${data.failedPayments > 0 ? 'danger' : 'success'}`}>{data.failedPayments > 0 ? 'Investigate' : 'Clear'}</span></td>
                    <td>Payments</td>
                  </tr>
                  <tr>
                    <td><strong>Support tickets</strong><small>User help backlog</small></td>
                    <td>{data.openSupportTickets ?? 0}</td>
                    <td><span className={`pill ${(data.openSupportTickets ?? 0) > 0 ? 'warning' : 'success'}`}>{(data.openSupportTickets ?? 0) > 0 ? 'Queued' : 'Clear'}</span></td>
                    <td>Support</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          {series && series.length > 0 ? (
            <div className="insight-grid">
              <section className="side-panel">
                <h3>Growth (30 days)</h3>
                <Sparkline label="New users / day" values={series.map((p) => p.newUsers)} accent="#14b8a6" />
                <Sparkline label="Gift volume (coins) / day" values={series.map((p) => p.giftVolumeCoins)} accent="#ffc857" />
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
          <section className={`side-panel risk-card ${data.pendingPayouts > 0 || data.failedPayments > 0 ? 'risk' : ''}`}>
            <h3>Payout risk overview</h3>
            <div className="risk-score">{data.pendingPayouts + data.failedPayments}</div>
            <p>{data.pendingPayouts > 0 || data.failedPayments > 0 ? 'Money movement needs review before approvals.' : 'No payout or payment blocker detected.'}</p>
            <a className="button secondary" href="/payouts">Review payouts</a>
          </section>
          <section className={`side-panel ${integrity && !integrity.ok ? 'risk' : ''}`}>
            <h3>Ledger status</h3>
            <p>{integrity ? (integrity.ok ? 'Balanced across transaction entries.' : `${integrity.unbalancedTransactions} transaction(s) out of balance.`) : 'Checking ledger integrity…'}</p>
            <a className="button secondary" href="/ledger-integrity">Open ledger</a>
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
