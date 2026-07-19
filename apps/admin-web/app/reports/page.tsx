'use client';

import { Suspense, useState } from 'react';
import { adminGet, adminPost } from '../../lib/api';
import { ActionMenu, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, PriorityBadge, PromptDialog, RoomCell, StatusBadge, UserCell } from '../admin-ui';
import { RowHighlightNotice, useRowHighlight } from '../highlight';
import { useAdminResource } from '../../lib/use-admin-resource';

type Report = {
  id: string;
  priority: string;
  reason: string;
  status: string;
  details?: string;
  createdAt: string;
  reporter?: { profile?: { username?: string; displayName?: string } };
  targetUser?: { profile?: { username?: string } };
  room?: { title?: string };
};

function ReportsPageInner() {
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [reason, setReason] = useState('');
  const { data: rows, error, reload } = useAdminResource<Report[]>(
    () => adminGet<Report[]>('/admin/reports'),
    [],
  );
  const { id: highlightId, missing } = useRowHighlight(rows);

  async function act(id: string, action: string, reason: string) {
    await adminPost(`/admin/reports/${id}/action`, { action, reason: reason || action });
    await reload();
  }

  if (error) return <ErrorState error={error} />;
  const filtered = rows.filter((r) =>
    (!status || r.status === status) &&
    (!priority || r.priority === priority) &&
    (!reason || r.reason.toLowerCase().includes(reason.toLowerCase()))
  );

  return (
    <>
      <PageHeader title="Reports" kicker="Search, filter, prioritise, and resolve the highest-risk moderation reports first." />
      <FilterBar onSubmit={(e) => e.preventDefault()}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>OPEN</option>
          <option>REVIEWING</option>
          <option>ACTIONED</option>
          <option>DISMISSED</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          <option>CRITICAL</option>
          <option>HIGH</option>
          <option>MEDIUM</option>
          <option>LOW</option>
        </select>
        <input placeholder="Reason / target / country" value={reason} onChange={(e) => setReason(e.target.value)} />
      </FilterBar>
      <RowHighlightNotice missing={missing} />
      <DataTable columns={['Priority', 'Reason', 'Target', 'Reporter', 'Room', 'Status', 'Created', 'Actions']} empty={<EmptyState>No reports in the moderation queue.</EmptyState>}>
            {filtered.map((r) => (
              <tr key={r.id} id={`row-${r.id}`} className={r.id === highlightId ? 'row-highlight' : undefined}>
                <td><PriorityBadge priority={r.priority} /></td>
                <td>{r.reason}</td>
                <td><UserCell name={r.targetUser?.profile?.username || 'N/A'} /></td>
                <td><UserCell name={r.reporter?.profile?.displayName || r.reporter?.profile?.username || '—'} /></td>
                <td><RoomCell title={r.room?.title || '—'} /></td>
                <td><StatusBadge status={r.status} /></td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>
                  <ActionMenu>
                  <PromptDialog triggerLabel="Review" triggerClassName="button" title="Review report" inputLabel="Reason" placeholder="Optional note" confirmLabel="Review" onSubmit={(reason) => act(r.id, 'REVIEWING', reason)} />
                  <PromptDialog triggerLabel="Escalate" danger title="Escalate report" inputLabel="Reason" placeholder="Why escalate?" confirmLabel="Escalate" onSubmit={(reason) => act(r.id, 'ESCALATE', reason)} />
                  <PromptDialog triggerLabel="Dismiss" title="Dismiss report" inputLabel="Reason" placeholder="Why dismiss?" confirmLabel="Dismiss" onSubmit={(reason) => act(r.id, 'DISMISS', reason)} />
                  <PromptDialog triggerLabel="Mark Actioned" danger title="Mark report actioned" inputLabel="Reason" placeholder="Action taken" confirmLabel="Mark Actioned" onSubmit={(reason) => act(r.id, 'ACTIONED', reason)} />
                  <PromptDialog triggerLabel="Suspend User" title="Suspend user" inputLabel="Reason" placeholder="Reason for suspension" confirmLabel="Suspend User" onSubmit={(reason) => act(r.id, 'SUSPEND_USER', reason)} />
                  <PromptDialog triggerLabel="Suspend Room" title="Suspend room" inputLabel="Reason" placeholder="Reason for suspension" confirmLabel="Suspend Room" onSubmit={(reason) => act(r.id, 'SUSPEND_ROOM', reason)} />
                  </ActionMenu>
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsPageInner />
    </Suspense>
  );
}
