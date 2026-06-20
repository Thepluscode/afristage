"use client";

import { useEffect, useState } from "react";
import { adminGet } from "../../lib/api";
import { AuditTimeline, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, UserCell } from "../admin-ui";

type Log = {
  id: string;
  actorId: string;
  action: string;
  target?: string | null;
  metadata?: unknown;
  createdAt: string;
};

export default function AuditLogsPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Log[]>("/admin/audit-logs")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState error={error} />;
  const filtered = rows.filter((l) =>
    (!actor || l.actorId.includes(actor)) &&
    (!action || l.action.toLowerCase().includes(action.toLowerCase()))
  );

  return (
    <>
      <PageHeader title="Audit Logs" kicker="Read-only operator trail for moderation, account, payout, and system actions." />
      <FilterBar onSubmit={(e) => e.preventDefault()}>
        <input placeholder="Actor id" value={actor} onChange={(e) => setActor(e.target.value)} />
        <input placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} />
        <span />
      </FilterBar>
      <div className="command-grid">
        <DataTable columns={['Action', 'Actor', 'Target type', 'Target ID', 'Metadata', 'When']} empty={<EmptyState>No audit logs yet.</EmptyState>}>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="pill creator">{l.action}</span>
                </td>
                <td><UserCell sub={l.actorId} /></td>
                <td>{l.target ? l.action.split('.')[0] || 'target' : '—'}</td>
                <td>{l.target || "—"}</td>
                <td>
                  <code>{l.metadata ? JSON.stringify(l.metadata) : ""}</code>
                </td>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
        </DataTable>
        <AuditTimeline rows={filtered} />
      </div>
    </>
  );
}
