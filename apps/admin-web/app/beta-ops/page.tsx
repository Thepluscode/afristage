'use client';

import { useEffect, useState } from 'react';
import { adminGet } from '../../lib/api';
import { DangerBanner, ErrorState, LoadingState, MetricCard, PageHeader, SuccessBanner, WarningBanner } from '../admin-ui';

type Ops = {
  activeRooms: number;
  pendingCreatorApprovals: number;
  pendingReports: number;
  criticalReports: number;
  pendingPayouts: number;
  openSupportTickets: number;
  paymentFailures: number;
  bannedUsers: number;
};

export default function BetaOpsPage() {
  const [data, setData] = useState<Ops | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Ops>('/admin/beta-ops').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!data) return <LoadingState label="Loading beta ops…" />;

  const cards: [string, number, 'good' | 'warn' | 'danger' | 'neutral'][] = [
    ['Active rooms', data.activeRooms, data.activeRooms > 0 ? 'good' : 'neutral'],
    ['Creator approvals', data.pendingCreatorApprovals, data.pendingCreatorApprovals > 0 ? 'warn' : 'good'],
    ['Pending reports', data.pendingReports, data.pendingReports > 0 ? 'warn' : 'good'],
    ['Critical reports', data.criticalReports, data.criticalReports > 0 ? 'danger' : 'good'],
    ['Pending payouts', data.pendingPayouts, data.pendingPayouts > 0 ? 'warn' : 'good'],
    ['Open support', data.openSupportTickets, data.openSupportTickets > 0 ? 'warn' : 'good'],
    ['Payment failures', data.paymentFailures, data.paymentFailures > 0 ? 'danger' : 'good'],
    ['Banned users', data.bannedUsers, 'neutral']
  ];

  return (
    <>
      <PageHeader title="Beta Control Room" kicker="Track whether the closed beta is healthy, active, and controlled." />
      {data.criticalReports > 0 ? (
        <DangerBanner>{data.criticalReports} critical report(s) need immediate moderation action.</DangerBanner>
      ) : data.paymentFailures > 0 ? (
        <WarningBanner>{data.paymentFailures} payment failure(s) need provider investigation.</WarningBanner>
      ) : (
        <SuccessBanner>No critical reports in the beta queue.</SuccessBanner>
      )}
      <div className="metric-grid">
        {cards.map(([label, value, tone]) => (
          <MetricCard key={label} label={label} value={value} tone={tone} />
        ))}
      </div>
      <section className="side-panel">
        <h3>Recent invite activity</h3>
        <p>Use Beta Invites to create, revoke, and audit closed-beta access codes.</p>
      </section>
    </>
  );
}
