"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { adminDelete, adminGet, adminPatch, adminPost } from "../../lib/api";
import { ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, PromptDialog, StatusBadge } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";
import { useAdminResource } from "../../lib/use-admin-resource";

type AgencyRow = {
  id: string;
  name: string;
  country?: string | null;
  commissionBps: number;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  _count?: { creators: number };
};

type AgencyDetail = AgencyRow & {
  earningsCoins: string;
  creators: { creatorUserId: string; stageName: string | null; approvalStatus: string | null; addedAt: string }[];
};

type Creator = { userId: string; stageName: string };

function AgenciesPageInner() {
  const { data: rows, error, setError, reload } = useAdminResource<AgencyRow[]>(
    () => adminGet<AgencyRow[]>("/admin/agencies"),
    [],
  );
  const [creators, setCreators] = useState<Creator[]>([]);
  const [name, setName] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [country, setCountry] = useState("");
  const [bps, setBps] = useState("");
  const [expanded, setExpanded] = useState<AgencyDetail | null>(null);
  const [assignId, setAssignId] = useState("");
  const { id: highlightId, missing } = useRowHighlight(rows);

  useEffect(() => {
    adminGet<Creator[]>("/admin/creators").then(setCreators).catch(() => {});
  }, []);

  async function openDetail(id: string) {
    setError(null);
    try {
      setExpanded(await adminGet<AgencyDetail>(`/admin/agencies/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function refreshDetail(id: string) {
    await reload();
    await openDetail(id);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name || !ownerUserId) return;
    setError(null);
    try {
      await adminPost("/admin/agencies", {
        name,
        ownerUserId,
        ...(country ? { country } : {}),
        ...(bps ? { commissionBps: Number(bps) } : {}),
      });
      setName("");
      setOwnerUserId("");
      setCountry("");
      setBps("");
      await reload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function editCommission(a: AgencyRow, value: string) {
    await adminPatch(`/admin/agencies/${a.id}`, { commissionBps: Number(value) });
    await reload();
  }

  async function setStatus(a: AgencyRow, status: "ACTIVE" | "SUSPENDED") {
    await adminPatch(`/admin/agencies/${a.id}`, { status });
    await reload();
  }

  // Reachable only with a selection — the Assign button is disabled otherwise.
  async function assign(agencyId: string) {
    setError(null);
    try {
      await adminPost(`/admin/agencies/${agencyId}/creators`, { creatorUserId: assignId });
      setAssignId("");
      await refreshDetail(agencyId);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(agencyId: string, creatorUserId: string) {
    await adminDelete(`/admin/agencies/${agencyId}/creators/${creatorUserId}`);
    await refreshDetail(agencyId);
  }

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader
        title="Agencies"
        kicker="Vetted creator managers. Commission is an explicit ledger split on managed creators' gifts — on-book, integrity-checked."
      />
      <FilterBar onSubmit={create}>
        <input placeholder="Agency name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Owner user id" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} />
        <input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
        <input placeholder="Commission bps (default 1000)" type="number" value={bps} onChange={(e) => setBps(e.target.value)} />
        <button className="button">Create Agency</button>
      </FilterBar>
      <RowHighlightNotice missing={missing} />
      {expanded && (
        <div className="table-wrap">
          <p className="banner-ok">
            <strong>{expanded.name}</strong> — lifetime commission earned: <strong>{expanded.earningsCoins} coins</strong>
          </p>
          <table>
            <thead>
              <tr>
                <th>Managed creator</th>
                <th>Approval</th>
                <th>Since</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expanded.creators.length === 0 && (
                <tr>
                  <td colSpan={4}>No creators assigned yet.</td>
                </tr>
              )}
              {expanded.creators.map((c) => (
                <tr key={c.creatorUserId}>
                  <td>{c.stageName ?? c.creatorUserId}</td>
                  <td>{c.approvalStatus ?? "—"}</td>
                  <td>{new Date(c.addedAt).toLocaleDateString()}</td>
                  <td>
                    <ConfirmDialog
                      title="Remove creator"
                      body={`Remove ${c.stageName ?? c.creatorUserId} from ${expanded.name}? Future gifts pay the creator their full share.`}
                      confirmLabel="Remove"
                      onConfirm={() => remove(expanded.id, c.creatorUserId)}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4}>
                  <select value={assignId} onChange={(e) => setAssignId(e.target.value)}>
                    <option value="">Assign a creator…</option>
                    {creators.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.stageName} ({c.userId.slice(0, 8)}…)
                      </option>
                    ))}
                  </select>{" "}
                  <button className="button secondary" disabled={!assignId} onClick={() => assign(expanded.id)}>
                    Assign Creator
                  </button>{" "}
                  <button className="button secondary" onClick={() => setExpanded(null)}>
                    Close
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <DataTable
        columns={["Agency", "Country", "Commission", "Creators", "Status", "Actions"]}
        empty={<EmptyState>No agencies yet. Onboard the first vetted manager above.</EmptyState>}
      >
        {rows.map((a) => (
          <tr key={a.id} id={`row-${a.id}`} className={a.id === highlightId ? "row-highlight" : undefined}>
            <td>{a.name}</td>
            <td>{a.country ?? "—"}</td>
            <td>{(a.commissionBps / 100).toFixed(1)}%</td>
            <td>{a._count?.creators ?? 0}</td>
            <td>
              <StatusBadge status={a.status} />
            </td>
            <td>
              <button className="button secondary" onClick={() => openDetail(a.id)}>
                View
              </button>
              <PromptDialog
                triggerLabel="Edit Commission"
                title="Edit commission"
                body={`Share of the creator's cut taken by ${a.name}, in basis points (100 = 1%, max 5000).`}
                inputLabel="Commission bps"
                placeholder="1000"
                defaultValue={String(a.commissionBps)}
                confirmLabel="Save"
                required
                onSubmit={(v) => editCommission(a, v)}
              />
              {a.status === "ACTIVE" ? (
                <ConfirmDialog
                  title="Suspend agency"
                  body={`Suspend ${a.name}? Its creators keep their full share while suspended.`}
                  confirmLabel="Suspend"
                  onConfirm={() => setStatus(a, "SUSPENDED")}
                />
              ) : (
                <button className="button" onClick={() => setStatus(a, "ACTIVE")}>
                  Reactivate
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

export default function AgenciesPage() {
  return (
    <Suspense fallback={null}>
      <AgenciesPageInner />
    </Suspense>
  );
}
