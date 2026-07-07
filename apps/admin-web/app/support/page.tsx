"use client";

import { Suspense, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { ActionMenu, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, PriorityBadge, StatusBadge, TicketThread, UserCell } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";
import { useAdminResource } from "../../lib/use-admin-resource";

type Ticket = {
  id: string;
  type: string;
  status: string;
  priority: string;
  subject: string;
  requesterId: string;
  createdAt: string;
};

function SupportPageInner() {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const { data: rows, error, reload } = useAdminResource<Ticket[]>(
    () => adminGet<Ticket[]>("/admin/support/tickets"),
    [],
  );
  const { id: highlightId, missing } = useRowHighlight(rows);

  async function assign(id: string) {
    await adminPost(`/admin/support/tickets/${id}/assign`);
    await reload();
  }
  async function resolve(id: string) {
    await adminPost(`/admin/support/tickets/${id}/resolve`);
    await reload();
  }

  if (error) return <ErrorState error={error} />;
  const filtered = rows.filter((t) => (!status || t.status === status) && (!type || t.type === type));
  const selected = filtered[0];

  return (
    <>
      <PageHeader title="Support Tickets" kicker="Triage, assign, reply, and resolve user tickets without confusing public replies and internal notes." />
      <FilterBar onSubmit={(e) => e.preventDefault()}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>OPEN</option>
          <option>IN_REVIEW</option>
          <option>WAITING_ON_USER</option>
          <option>RESOLVED</option>
          <option>CLOSED</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {Array.from(new Set(rows.map((t) => t.type))).map((v) => <option key={v}>{v}</option>)}
        </select>
        <span />
      </FilterBar>
      <RowHighlightNotice missing={missing} />
      <div className="command-grid">
        <DataTable columns={['Subject', 'Requester', 'Type', 'Priority', 'Status', 'Created', 'Assigned', 'Actions']} empty={<EmptyState>No support tickets are open.</EmptyState>}>
            {filtered.map((t) => (
              <tr key={t.id} id={`row-${t.id}`} className={t.id === highlightId ? 'row-highlight' : undefined}>
                <td>{t.subject}</td>
                <td><UserCell sub={t.requesterId} /></td>
                <td>{t.type}</td>
                <td><PriorityBadge priority={t.priority} /></td>
                <td><StatusBadge status={t.status} /></td>
                <td>{new Date(t.createdAt).toLocaleString()}</td>
                <td>Unassigned</td>
                <td>
                  <ActionMenu>
                  <button className="button" onClick={() => assign(t.id)}>
                    Assign to Me
                  </button>
                  <button
                    className="button secondary"
                    disabled={t.status === "RESOLVED"}
                    onClick={() => resolve(t.id)}
                  >
                    Resolve Ticket
                  </button>
                  </ActionMenu>
                </td>
              </tr>
            ))}
        </DataTable>
        {selected ? <TicketThread subject={selected.subject} requester={selected.requesterId} /> : <TicketThread subject="No ticket selected" requester="system" />}
      </div>
    </>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportPageInner />
    </Suspense>
  );
}
