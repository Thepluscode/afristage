'use client';

import { adminGet } from '../../lib/api';
import { DataTable, EmptyState, ErrorState, PageHeader, StatusBadge, UserCell } from '../admin-ui';
import { useAdminResource } from '../../lib/use-admin-resource';

type ActivityRow = {
  id: string;
  displayName: string;
  email?: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastActiveAt: string | null;
  daysSinceActive: number | null;
  weekActions: number;
  weekBreakdown: { rooms: number; gifts: number; missions: number };
};

type ActivityResponse = { windowDays: number; generatedAt: string; users: ActivityRow[] };

// "Gone quiet" = was active at some point but not in the last 3 days. That's the
// re-engagement window the ops lead should act on (personal outreach at beta
// scale). Never-active accounts are an activation gap, flagged separately.
const QUIET_DAYS = 3;

function lastActiveLabel(row: ActivityRow): string {
  if (row.lastActiveAt === null) return 'Never active';
  if (row.daysSinceActive === 0) return 'Today';
  if (row.daysSinceActive === 1) return 'Yesterday';
  return `${row.daysSinceActive}d ago`;
}

export default function UserActivityPage() {
  const { data, error } = useAdminResource<ActivityResponse | null>(
    () => adminGet<ActivityResponse>('/admin/user-activity'),
    null
  );

  if (error) return <ErrorState error={error} />;

  const rows = data?.users ?? [];
  const window = data?.windowDays ?? 7;

  return (
    <div>
      <PageHeader
        title="User activity"
        kicker={`Who is meaningfully active this week — and who has gone quiet. Reach out to quiet users before they disappear. Actions counted over the last ${window} days: rooms joined, gifts sent, missions claimed.`}
      />
      <DataTable
        columns={['User', 'Status', 'Last active', `Actions (${window}d)`, 'Rooms', 'Gifts', 'Missions', 'Signal']}
        empty={<EmptyState>No users yet.</EmptyState>}
      >
        {rows.map((r) => {
          // daysSinceActive is null iff the user has never been active.
          const quiet = r.daysSinceActive !== null && r.daysSinceActive >= QUIET_DAYS;
          const neverActive = r.daysSinceActive === null;
          return (
            <tr key={r.id}>
              <td><UserCell name={r.displayName} sub={r.email} /></td>
              <td><StatusBadge status={r.status} /></td>
              <td>{lastActiveLabel(r)}</td>
              <td>{r.weekActions}</td>
              <td>{r.weekBreakdown.rooms}</td>
              <td>{r.weekBreakdown.gifts}</td>
              <td>{r.weekBreakdown.missions}</td>
              <td>
                {quiet ? (
                  <StatusBadge status="QUIET" />
                ) : neverActive ? (
                  <StatusBadge status="NEW" />
                ) : (
                  <StatusBadge status="ACTIVE" />
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
