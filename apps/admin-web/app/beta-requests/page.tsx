"use client";

import { useEffect, useState } from "react";
import { adminGet } from "../../lib/api";
import { DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge } from "../admin-ui";

type BetaRequest = {
  id: string;
  email: string;
  displayName?: string | null;
  category?: string | null;
  country?: string | null;
  status: string;
  createdAt: string;
};

export default function BetaRequestsPage() {
  const [rows, setRows] = useState<BetaRequest[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const q = status ? `?status=${status}` : "";
      setRows(await adminGet<BetaRequest[]>(`/admin/beta-requests${q}`));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Waitlist" kicker="Creators and viewers who requested an invite from the landing page. Review, then issue invites from Beta Invites." />
      <FilterBar onSubmit={(e) => e.preventDefault()}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="INVITED">Invited</option>
          <option value="DECLINED">Declined</option>
        </select>
      </FilterBar>
      <DataTable
        columns={["Email", "Name", "Category", "Country", "Status", "Requested"]}
        empty={<EmptyState>No invite requests yet. They'll appear here as people sign up from the landing page.</EmptyState>}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.email}</td>
            <td>{r.displayName || "—"}</td>
            <td>{r.category || "—"}</td>
            <td>{r.country || "—"}</td>
            <td><StatusBadge status={r.status} /></td>
            <td>{new Date(r.createdAt).toLocaleString()}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
