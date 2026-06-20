'use client';

import { useEffect, useState } from 'react';
import { adminGet } from '../lib/api';
import { AuditTimeline, DangerBanner, ErrorState, LoadingState, MetricCard, PageHeader, SuccessBanner, WarningBanner } from './admin-ui';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Dashboard>('/admin/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!data) return <LoadingState label="Loading operations dashboard…" />;

  const cards: [string, string | number, 'good' | 'warn' | 'danger' | 'neutral', string?][] = [
    ['Active rooms', data.activeRooms, data.activeRooms > 0 ? 'good' : 'neutral', 'Live capacity'],
    ['Creator approvals', data.pendingCreatorApprovals ?? data.newCreatorsToday, (data.pendingCreatorApprovals ?? 0) > 0 ? 'warn' : 'neutral', 'Pending review'],
    ['Critical reports', data.criticalReports, data.criticalReports > 0 ? 'danger' : 'good', 'Moderation priority'],
    ['Pending payouts', data.pendingPayouts, data.pendingPayouts > 0 ? 'warn' : 'good', 'Money movement'],
    ['Open support', data.openSupportTickets ?? 0, (data.openSupportTickets ?? 0) > 0 ? 'warn' : 'good', 'User backlog'],
    ['Failed payments', data.failedPayments, data.failedPayments > 0 ? 'danger' : 'good', 'Provider risk'],
    ['Gift volume', `${data.grossGiftVolumeCoins} COIN`, 'neutral', 'Gross beta support'],
    ['New users today', data.newUsersToday, 'neutral', 'Growth pulse']
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
        kicker="Live room health, moderation pressure, payout risk, support load, and platform growth in one control surface."
      />
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
        <section>
          <div className="metric-grid">
            {cards.map(([label, value, tone, delta]) => (
              <MetricCard key={label} label={label} value={value} tone={tone} delta={delta} />
            ))}
          </div>
          <div className="side-panel">
            <h3>Priority queue</h3>
            <p>Critical reports, payment failures, suspicious payout activity, and ledger imbalance should be cleared before routine work.</p>
          </div>
        </section>
        <AuditTimeline rows={auditSeed} />
      </div>
    </>
  );
}
