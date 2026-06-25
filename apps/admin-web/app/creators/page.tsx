"use client";

import { useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { ActionMenu, ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge, UserCell } from "../admin-ui";

type Creator = {
  id: string;
  userId: string;
  stageName: string;
  category: string;
  country: string;
  approvalStatus: string;
  kycStatus: string;
  createdAt?: string;
  earnings?: string | number;
  totalRooms?: number;
  reportsCount?: number;
  user?: { email?: string | null };
};

export default function CreatorsPage() {
  const [rows, setRows] = useState<Creator[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await adminGet<Creator[]>("/admin/creators"));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function approve(userId: string) {
    await adminPost(`/admin/creators/${userId}/approve`);
    await load();
  }
  async function reject(userId: string) {
    const reason = prompt("Rejection reason") || "Rejected by admin";
    await adminPost(`/admin/creators/${userId}/reject`, { reason });
    await load();
  }
  async function suspend(userId: string) {
    const reason = prompt("Suspension reason") || "Suspended by admin";
    await adminPost(`/admin/creators/${userId}/suspend`, { reason });
    await load();
  }

  if (error) return <ErrorState error={error} />;
  const filtered = rows.filter((c) => !status || c.approvalStatus === status);

  return (
    <>
      <PageHeader title="Creators" kicker="Review creator applications with safety, earnings, and live-room context." />
      <FilterBar onSubmit={(e) => e.preventDefault()}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All approval states</option>
          <option>PENDING</option>
          <option>APPROVED</option>
          <option>REJECTED</option>
          <option>SUSPENDED</option>
        </select>
        <span />
        <span />
      </FilterBar>
      <DataTable columns={['Creator', 'Country', 'Category', 'Approval', 'Applied', 'Earnings', 'Rooms', 'Reports', 'Actions']} empty={<EmptyState>No creator applications need review.</EmptyState>}>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td><UserCell name={c.stageName || c.user?.email} sub={c.userId} /></td>
                <td>{c.country || '—'}</td>
                <td>{c.category || '—'}</td>
                <td><StatusBadge status={c.approvalStatus} /> <span className="pill">{c.kycStatus}</span></td>
                <td>{c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}</td>
                <td>{c.earnings ?? '—'}</td>
                <td>{c.totalRooms ?? '—'}</td>
                <td>{c.reportsCount ?? 0}</td>
                <td>
                  <ActionMenu>
                  <button
                    className="button"
                    disabled={c.approvalStatus === "APPROVED"}
                    onClick={() => approve(c.userId)}
                  >
                    Approve Creator
                  </button>
                  <ConfirmDialog title="Reject creator" body="Rejecting requires a reason and blocks creator live access." confirmLabel="Reject" disabled={c.approvalStatus === "REJECTED"} onConfirm={() => reject(c.userId)} />
                  <ConfirmDialog title="Suspend creator" body="Suspending disables creator live access and requires a reason." confirmLabel="Suspend" disabled={c.approvalStatus === "SUSPENDED"} onConfirm={() => suspend(c.userId)} />
                  </ActionMenu>
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}
