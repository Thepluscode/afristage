"use client";

import { Suspense, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { ActionMenu, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, PromptDialog, StatusBadge, UserCell } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";
import { useAdminResource } from "../../lib/use-admin-resource";

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

function CreatorsPageInner() {
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const { data: rows, error, reload } = useAdminResource<Creator[]>(
    () => adminGet<Creator[]>("/admin/creators"),
    [],
  );
  const { id: highlightId, missing } = useRowHighlight(rows);

  // A decision is made against the application as it appeared in THIS list, so the
  // status that was on screen is sent with it. The API applies the decision only if
  // nothing changed in between — the applicant amending their application, or
  // another admin already deciding — and returns 409 otherwise, rather than
  // applying a review to something this admin never actually read.
  async function review(c: Creator, action: "approve" | "reject" | "suspend", reason?: string) {
    setNotice(null);
    try {
      await adminPost(`/admin/creators/${c.userId}/${action}`, {
        ...(reason === undefined ? {} : { reason }),
        expectedStatus: c.approvalStatus,
      });
    } catch (e) {
      const message = (e as Error).message;
      // Without this the click simply did nothing: adminPost throws, and an
      // unhandled rejection is invisible to the reviewer.
      setNotice(
        message.includes(" 409 ")
          ? `${c.stageName || c.userId} changed since this list was loaded — refreshed below, please review again.`
          : `Could not ${action} ${c.stageName || c.userId}: ${message}`,
      );
    }
    await reload();
  }

  const approve = (c: Creator) => review(c, "approve");
  const reject = (c: Creator, reason: string) => review(c, "reject", reason || "Rejected by admin");
  const suspend = (c: Creator, reason: string) => review(c, "suspend", reason || "Suspended by admin");

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
      <RowHighlightNotice missing={missing} />
      {notice ? <div className="row-missing-note" role="status">{notice}</div> : null}
      <DataTable columns={['Creator', 'Country', 'Category', 'Approval', 'Applied', 'Earnings', 'Rooms', 'Reports', 'Actions']} empty={<EmptyState>No creator applications need review.</EmptyState>}>
            {filtered.map((c) => (
              <tr key={c.id} id={`row-${c.id}`} className={c.id === highlightId ? 'row-highlight' : undefined}>
                <td><UserCell name={c.stageName || c.user?.email} sub={c.userId} /></td>
                <td>{c.country || '—'}</td>
                <td>{c.category || '—'}</td>
                <td><StatusBadge status={c.approvalStatus} /> <StatusBadge status={c.kycStatus} /></td>
                <td>{c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}</td>
                <td>{c.earnings ?? '—'}</td>
                <td>{c.totalRooms ?? '—'}</td>
                <td>{c.reportsCount ?? 0}</td>
                <td>
                  <ActionMenu>
                  <button
                    className="button"
                    disabled={c.approvalStatus === "APPROVED"}
                    onClick={() => approve(c)}
                  >
                    Approve Creator
                  </button>
                  <PromptDialog triggerLabel="Reject" title="Reject creator" body="Rejecting requires a reason and blocks creator live access." inputLabel="Reason" placeholder="Reason for rejection" confirmLabel="Reject" danger disabled={c.approvalStatus === "REJECTED"} onSubmit={(reason) => reject(c, reason)} />
                  <PromptDialog triggerLabel="Suspend" title="Suspend creator" body="Suspending disables creator live access and requires a reason." inputLabel="Reason" placeholder="Reason for suspension" confirmLabel="Suspend" danger disabled={c.approvalStatus === "SUSPENDED"} onSubmit={(reason) => suspend(c, reason)} />
                  </ActionMenu>
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}

export default function CreatorsPage() {
  return (
    <Suspense fallback={null}>
      <CreatorsPageInner />
    </Suspense>
  );
}
