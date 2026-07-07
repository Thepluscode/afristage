"use client";

import { useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { useAdminResource } from "../../lib/use-admin-resource";
import { ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge, SuccessBanner } from "../admin-ui";

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
  const [status, setStatus] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const { data: rows, error, reload } = useAdminResource<BetaRequest[]>(
    () => adminGet<BetaRequest[]>(`/admin/beta-requests${status ? `?status=${status}` : ""}`),
    [],
  );
  // The status filter changes the loader's query — refetch when it moves.
  useEffect(() => {
    reload();
  }, [status, reload]);

  async function issueInvite(id: string) {
    const res = await adminPost<{ code: string }>(`/admin/beta-requests/${id}/invite`, { type: "CREATOR" });
    setLastCode(res.code); // shown once
    await reload();
  }

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Waitlist" kicker="Creators and viewers who requested an invite from the landing page. Issue an invite to bring them into the beta." />
      {lastCode ? (
        <SuccessBanner>
          Invite code (copy now, shown once): <code>{lastCode}</code>
        </SuccessBanner>
      ) : null}
      <FilterBar onSubmit={(e) => e.preventDefault()}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="INVITED">Invited</option>
          <option value="DECLINED">Declined</option>
        </select>
      </FilterBar>
      <DataTable
        columns={["Email", "Name", "Category", "Country", "Status", "Requested", "Actions"]}
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
            <td className="actions">
              <ConfirmDialog
                title="Issue invite"
                body={`Issue a creator beta invite for ${r.email}? They'll get a one-time code to join.`}
                confirmLabel="Issue invite"
                disabled={r.status !== "PENDING"}
                onConfirm={() => issueInvite(r.id)}
              />
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
