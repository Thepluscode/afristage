'use client';

import { Suspense, useEffect, useState } from 'react';
import { adminGet, adminPost } from '../../lib/api';
import { ActionMenu, ConfirmDialog, DataTable, EmptyState, ErrorState, PageHeader, RoomCell, StatusBadge, UserCell, WarningBanner } from '../admin-ui';
import { RowHighlightNotice, useRowHighlight } from '../highlight';

type Room = {
  id: string;
  title: string;
  status: string;
  category: string;
  country?: string;
  language?: string;
  reportsCount?: number;
  peakViewers: number;
  startedAt?: string | null;
  host?: { profile?: { displayName?: string }; creatorProfile?: { stageName?: string } };
};

function LiveRoomsPageInner() {
  const [rows, setRows] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { id: highlightId, missing } = useRowHighlight(rows);

  async function load() {
    try {
      setRows(await adminGet<Room[]>('/admin/live-rooms'));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function suspend(id: string) {
    await adminPost(`/admin/live-rooms/${id}/suspend`, { reason: 'admin takedown' });
    await load();
  }
  async function end(id: string) {
    await adminPost(`/admin/live-rooms/${id}/end`);
    await load();
  }

  if (error) return <ErrorState error={error} />;
  const ordered = [...rows].sort((a, b) => Number(b.status === 'LIVE') - Number(a.status === 'LIVE') || (b.reportsCount ?? 0) - (a.reportsCount ?? 0));

  return (
    <>
      <PageHeader title="Live Rooms" kicker="Monitor active rooms first, then take bounded moderation actions with confirmation." />
      {ordered.some((r) => (r.reportsCount ?? 0) > 0) ? (
        <WarningBanner>Reported live rooms are prioritised at the top of the queue.</WarningBanner>
      ) : null}
      <RowHighlightNotice missing={missing} />
      <DataTable columns={['Room', 'Host', 'Status', 'Viewers', 'Category', 'Region', 'Reports', 'Started', 'Actions']} empty={<EmptyState>No live rooms need operator attention.</EmptyState>}>
            {ordered.map((r) => (
              <tr key={r.id} id={`row-${r.id}`} className={r.id === highlightId ? 'row-highlight' : undefined}>
                <td><RoomCell title={r.title} sub={r.id.slice(0, 8)} /></td>
                <td><UserCell name={r.host?.creatorProfile?.stageName || r.host?.profile?.displayName} /></td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.peakViewers}</td>
                <td>{r.category || '—'}</td>
                <td>{r.country || '—'} · {r.language || '—'}</td>
                <td><span className={`pill ${(r.reportsCount ?? 0) > 0 ? 'warning' : ''}`}>{r.reportsCount ?? 0}</span></td>
                <td>{r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}</td>
                <td>
                  <ActionMenu>
                    <ConfirmDialog
                      title="Suspend room"
                      body={`Suspend "${r.title}" immediately? This removes the room from live operation.`}
                      confirmLabel="Suspend"
                      disabled={r.status === 'SUSPENDED'}
                      onConfirm={() => suspend(r.id)}
                    />
                    <ConfirmDialog
                      title="End room"
                      body={`Force-end "${r.title}"? This stops the stream for every viewer.`}
                      confirmLabel="End"
                      disabled={r.status !== 'LIVE'}
                      onConfirm={() => end(r.id)}
                    />
                  </ActionMenu>
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}

export default function LiveRoomsPage() {
  return (
    <Suspense fallback={null}>
      <LiveRoomsPageInner />
    </Suspense>
  );
}
