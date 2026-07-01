"use client";

import { Suspense, useEffect, useState } from "react";
import { adminGet } from "../../lib/api";
import { DataTable, EmptyState, ErrorState, FilterBar, MoneyAmount, PageHeader, StatusBadge, UserCell } from "../admin-ui";
import { useRowHighlight } from "../highlight";

type Payment = {
  id: string;
  provider: string;
  amountMinor: string | number;
  currency: string;
  coinAmount: number;
  status: string;
  createdAt: string;
  user?: { email?: string; profile?: { displayName?: string; username?: string } };
  reference?: string;
  processedAt?: string | null;
  webhookStatus?: string;
};

function PaymentsPageInner() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const highlightId = useRowHighlight(rows);

  useEffect(() => {
    adminGet<Payment[]>("/admin/payments")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState error={error} />;
  const filtered = rows.filter((p) => (!provider || p.provider === provider) && (!status || p.status === status));

  return (
    <>
      <PageHeader title="Payments" kicker="Investigate coin purchases, provider states, and webhook reconciliation issues." />
      <FilterBar onSubmit={(e) => e.preventDefault()}>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">All providers</option>
          {Array.from(new Set(rows.map((p) => p.provider))).map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Array.from(new Set(rows.map((p) => p.status))).map((s) => <option key={s}>{s}</option>)}
        </select>
        <span />
      </FilterBar>
      <DataTable columns={['Reference', 'Provider', 'User', 'Amount', 'Coins', 'Status', 'Webhook', 'Created', 'Processed']} empty={<EmptyState>No payments have been recorded.</EmptyState>}>
            {filtered.map((p) => (
              <tr key={p.id} id={`row-${p.id}`} className={p.id === highlightId ? 'row-highlight' : undefined}>
                <td><code>{p.reference || p.id.slice(0, 10)}</code></td>
                <td>{p.provider}</td>
                <td><UserCell name={p.user?.profile?.displayName || p.user?.profile?.username || p.user?.email || '—'} /></td>
                <td><MoneyAmount minor={p.amountMinor} currency={p.currency} /></td>
                <td>{p.coinAmount.toLocaleString()}</td>
                <td><StatusBadge status={p.status} /></td>
                <td><StatusBadge status={p.webhookStatus || 'PENDING'} /></td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td>{p.processedAt ? new Date(p.processedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsPageInner />
    </Suspense>
  );
}
