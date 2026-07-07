"use client";

import { Suspense, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { ActionMenu, ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge, UserCell } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";
import { useAdminResource } from "../../lib/use-admin-resource";

type Session = {
  id: string;
  device?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastSeenAt: string;
};

type User = {
  id: string;
  email?: string | null;
  role: string;
  status: string;
  profile?: { username?: string; displayName?: string } | null;
  country?: string | null;
  creatorProfile?: { approvalStatus?: string } | null;
};

function UsersPageInner() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  // The loader closes over q; useAdminResource reads it through a ref, so a
  // submit-triggered reload always searches the latest committed query.
  const { data: rows, error, setError, reload } = useAdminResource<User[]>(
    () => adminGet<User[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    [],
  );
  const { id: highlightId, missing } = useRowHighlight(rows);
  const [sessions, setSessions] = useState<{ user: User; rows: Session[] } | null>(null);

  async function openSessions(u: User) {
    try {
      setSessions({ user: u, rows: await adminGet<Session[]>(`/admin/users/${u.id}/sessions`) });
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function revokeSession(userId: string, sessionId: string) {
    await adminPost(`/admin/users/${userId}/sessions/${sessionId}/revoke`);
    const u = sessions!.user;
    setSessions({ user: u, rows: await adminGet<Session[]>(`/admin/users/${u.id}/sessions`) });
  }
  async function revokeAll(userId: string) {
    await adminPost(`/admin/users/${userId}/sessions/revoke-all`);
    const u = sessions!.user;
    setSessions({ user: u, rows: await adminGet<Session[]>(`/admin/users/${u.id}/sessions`) });
  }

  async function suspend(id: string) {
    await adminPost(`/admin/users/${id}/suspend`, { reason: "admin action" });
    await reload();
  }
  async function ban(id: string) {
    await adminPost(`/admin/users/${id}/ban`, { reason: "admin action" });
    await reload();
  }
  async function reactivate(id: string) {
    await adminPost(`/admin/users/${id}/reactivate`);
    await reload();
  }

  if (error) return <ErrorState error={error} />;
  const filtered = rows.filter((u) => (!role || u.role === role) && (!status || u.status === status));

  return (
    <>
      <PageHeader title="Users" kicker="Search accounts, inspect role/status, and take bounded access actions." />
      <FilterBar
        onSubmit={(e) => {
          e.preventDefault();
          reload();
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
      <RowHighlightNotice missing={missing} />
      {sessions && (
        <div className="table-wrap">
          <p className="banner-ok">
            Signed-in devices for <strong>{sessions.user.profile?.displayName || sessions.user.email || sessions.user.id}</strong>{' '}
            — revoking kills that device's refresh token on next use.
          </p>
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>IP</th>
                <th>Last active</th>
                <th>Since</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.rows.length === 0 && (
                <tr>
                  <td colSpan={5}>No active sessions.</td>
                </tr>
              )}
              {sessions.rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.device || s.userAgent || 'Unknown device'}</td>
                  <td>{s.ip ?? '—'}</td>
                  <td>{new Date(s.lastSeenAt).toLocaleString()}</td>
                  <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td>
                    <ConfirmDialog
                      title="Revoke session"
                      body="Sign this device out? It will need to log in again."
                      confirmLabel="Revoke"
                      onConfirm={() => revokeSession(sessions.user.id, s.id)}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5}>
                  <ConfirmDialog
                    title="Sign out everywhere"
                    body="Revoke every session AND invalidate all refresh tokens for this account?"
                    confirmLabel="Sign Out Everywhere"
                    onConfirm={() => revokeAll(sessions.user.id)}
                  />{' '}
                  <button className="button secondary" onClick={() => setSessions(null)}>
                    Close
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <DataTable columns={['User', 'Role', 'Status', 'Country', 'Wallet', 'Creator', 'Last activity', 'Actions']} empty={<EmptyState>No users match this search.</EmptyState>}>
            {filtered.map((u) => (
              <tr key={u.id} id={`row-${u.id}`} className={u.id === highlightId ? 'row-highlight' : undefined}>
                <td><UserCell name={u.profile?.displayName || u.profile?.username || u.email} sub={u.id} /></td>
                <td><span className="pill creator">{u.role}</span></td>
                <td><StatusBadge status={u.status} /></td>
                <td>{u.country || '—'}</td>
                <td><span className="pill balanced">Wallet</span></td>
                <td>{u.creatorProfile?.approvalStatus ? <StatusBadge status={u.creatorProfile.approvalStatus} /> : '—'}</td>
                <td>—</td>
                <td>
                  <ActionMenu>
                  <button className="button secondary" onClick={() => openSessions(u)}>
                    Sessions
                  </button>
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

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersPageInner />
    </Suspense>
  );
}
