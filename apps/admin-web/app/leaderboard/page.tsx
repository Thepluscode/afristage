'use client';

import { useEffect, useState } from 'react';
import { adminGet } from '../../lib/api';
import { DataTable, EmptyState, ErrorState, LoadingState, PageHeader } from '../admin-ui';

type Row = { rank: number; userId: string; label: string; totalCoins: number };
type Kind = 'creator' | 'supporter';
type Win = 'day' | 'week' | 'all';

const WINDOWS: { key: Win; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'all', label: 'All time' }
];

export default function LeaderboardPage() {
  const [kind, setKind] = useState<Kind>('creator');
  const [win, setWin] = useState<Win>('week');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    adminGet<Row[]>(`/admin/leaderboard?type=${kind}&window=${win}`)
      .then(setRows)
      .catch((e: any) => setError(e.message));
  }, [kind, win]);

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Charts" kicker="Top creators and supporters by gift coins, across time windows." />
      <div className="chart-controls">
        <div className="seg" role="group" aria-label="Chart type">
          <button className={kind === 'creator' ? 'seg-on' : ''} onClick={() => setKind('creator')}>
            Top creators
          </button>
          <button className={kind === 'supporter' ? 'seg-on' : ''} onClick={() => setKind('supporter')}>
            Top supporters
          </button>
        </div>
        <div className="seg" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button key={w.key} className={win === w.key ? 'seg-on' : ''} onClick={() => setWin(w.key)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>
      {rows === null ? (
        <LoadingState label="Loading charts…" />
      ) : (
        <DataTable
          columns={['#', kind === 'creator' ? 'Creator' : 'Supporter', 'Gift coins']}
          empty={<EmptyState>No gifting activity in this window yet.</EmptyState>}
        >
          {rows.map((r) => (
            <tr key={r.userId}>
              <td><strong className="rank">{r.rank}</strong></td>
              <td>{r.label}</td>
              <td>{r.totalCoins.toLocaleString()} coins</td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
