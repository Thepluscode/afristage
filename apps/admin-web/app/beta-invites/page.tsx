"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge, SuccessBanner } from "../admin-ui";

type Invite = {
  id: string;
  email?: string | null;
  type: string;
  status: string;
  expiresAt: string;
};

export default function BetaInvitesPage() {
  const [rows, setRows] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [type, setType] = useState("VIEWER");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await adminGet<Invite[]>("/admin/beta-invites"));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const res = await adminPost<{ code: string }>("/admin/beta-invites", {
      email: email || undefined,
      type,
    });
    setLastCode(res.code); // shown once
    setEmail("");
    await load();
  }

  async function revoke(id: string) {
    await adminPost(`/admin/beta-invites/${id}/revoke`);
    await load();
  }

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Beta Invites" kicker="Issue, monitor, and revoke closed-beta invite codes without losing rollout control." />
      {lastCode ? (
        <SuccessBanner>
          Invite code (copy now, shown once): <code>{lastCode}</code>
        </SuccessBanner>
      ) : null}
      <FilterBar onSubmit={create}>
        <input
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option>VIEWER</option>
          <option>CREATOR</option>
          <option>ADMIN</option>
        </select>
        <button className="button">Create invite</button>
      </FilterBar>
      <DataTable columns={['Email', 'Type', 'Status', 'Expires', 'Actions']} empty={<EmptyState>No beta invites have been created.</EmptyState>}>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.email || "—"}</td>
                <td>
                  <span className="pill creator">{i.type}</span>
                </td>
                <td><StatusBadge status={i.status} /></td>
                <td>{new Date(i.expiresAt).toLocaleString()}</td>
                <td className="actions">
                  <ConfirmDialog title="Revoke invite" body={`Revoke invite for ${i.email || i.type}? This code can no longer be accepted.`} confirmLabel="Revoke" disabled={i.status !== "PENDING"} onConfirm={() => revoke(i.id)} />
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}
