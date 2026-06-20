'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminPost } from '../../lib/api';
import { ActionMenu, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, PriorityBadge, RoomCell, StatusBadge, UserCell } from '../admin-ui';

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

export default function ReportsPage() {
  const [rows, setRows] = useState<Report[]>([]);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await adminGet<Report[]>('/admin/reports'));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: string) {
    const reason = prompt('Reason') || action;
    await adminPost(`/admin/reports/${id}/action`, { action, reason });
    await load();
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
      <DataTable columns={['Priority', 'Reason', 'Target', 'Reporter', 'Room', 'Status', 'Created', 'Reviewer', 'Actions']} empty={<EmptyState>No reports in the moderation queue.</EmptyState>}>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><PriorityBadge priority={r.priority} /></td>
                <td>{r.reason}</td>
                <td><UserCell name={r.targetUser?.profile?.username || 'N/A'} /></td>
                <td><UserCell name={r.reporter?.profile?.displayName || r.reporter?.profile?.username || '—'} /></td>
                <td><RoomCell title={r.room?.title || '—'} /></td>
                <td><StatusBadge status={r.status} /></td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>Unassigned</td>
                <td>
                  <ActionMenu>
                  <button className="button" onClick={() => act(r.id, 'REVIEWING')}>Review</button>
                  <button className="button danger" onClick={() => act(r.id, 'ESCALATE')}>Escalate</button>
                  <button className="button secondary" onClick={() => act(r.id, 'DISMISS')}>Dismiss</button>
                  <button className="button danger" onClick={() => act(r.id, 'ACTIONED')}>Mark Actioned</button>
                  <button className="button secondary" onClick={() => act(r.id, 'SUSPEND_USER')}>Suspend User</button>
                  <button className="button secondary" onClick={() => act(r.id, 'SUSPEND_ROOM')}>Suspend Room</button>
                  </ActionMenu>
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}
