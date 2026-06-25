"use client";

import { useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { ActionMenu, ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge, UserCell } from "../admin-ui";

type User = {
  id: string;
  email?: string | null;
  role: string;
  status: string;
  profile?: { username?: string; displayName?: string } | null;
  country?: string | null;
  creatorProfile?: { approvalStatus?: string } | null;
};

export default function UsersPage() {
  const [rows, setRows] = useState<User[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(query = "") {
    try {
      setRows(
        await adminGet<User[]>(
          `/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function suspend(id: string) {
    await adminPost(`/admin/users/${id}/suspend`, { reason: "admin action" });
    await load(q);
  }
  async function ban(id: string) {
    await adminPost(`/admin/users/${id}/ban`, { reason: "admin action" });
    await load(q);
  }
  async function reactivate(id: string) {
    await adminPost(`/admin/users/${id}/reactivate`);
    await load(q);
  }

  if (error) return <ErrorState error={error} />;
  const filtered = rows.filter((u) => (!role || u.role === role) && (!status || u.status === status));

  return (
    <>
      <PageHeader title="Users" kicker="Search accounts, inspect role/status, and take bounded access actions." />
      <FilterBar
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
      >
        <input
          placeholder="Search email / username / phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option>VIEWER</option>
          <option>CREATOR</option>
          <option>ADMIN</option>
          <option>SUPER_ADMIN</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>ACTIVE</option>
          <option>SUSPENDED</option>
          <option>BANNED</option>
        </select>
        <button className="button">Search</button>
      </FilterBar>
      <DataTable columns={['User', 'Role', 'Status', 'Country', 'Wallet', 'Creator', 'Last activity', 'Actions']} empty={<EmptyState>No users match this search.</EmptyState>}>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td><UserCell name={u.profile?.displayName || u.profile?.username || u.email} sub={u.id} /></td>
                <td><span className="pill creator">{u.role}</span></td>
                <td><StatusBadge status={u.status} /></td>
                <td>{u.country || '—'}</td>
                <td><span className="pill balanced">Wallet</span></td>
                <td>{u.creatorProfile?.approvalStatus ? <StatusBadge status={u.creatorProfile.approvalStatus} /> : '—'}</td>
                <td>—</td>
                <td>
                  <ActionMenu>
                  <ConfirmDialog title="Suspend user" body="Suspend this user? This affects account access." confirmLabel="Suspend" disabled={u.status !== "ACTIVE"} onConfirm={() => suspend(u.id)} />
                  <ConfirmDialog title="Ban user" body="Ban this user? This blocks login and should be reserved for severe abuse." confirmLabel="Ban" disabled={u.status === "BANNED"} onConfirm={() => ban(u.id)} />
                  <button
                    className="button"
                    disabled={u.status === "ACTIVE"}
                    onClick={() => reactivate(u.id)}
                  >
                    Reactivate User
                  </button>
                  </ActionMenu>
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}
