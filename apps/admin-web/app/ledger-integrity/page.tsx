'use client';

import { useEffect, useState } from 'react';
import { adminGet } from '../../lib/api';
import { DataTable, EmptyState, ErrorState, LedgerIntegrityPanel, LoadingState, PageHeader } from '../admin-ui';

type Entry = { direction: string; amountMinor: string | number; account?: { userId?: string } };
type Txn = {
  id: string;
  type: string;
  status: string;
  externalReference?: string | null;
  createdAt: string;
  entries?: Entry[];
};
type Integrity = { ok: boolean; unbalancedTransactions: number; checkedAt?: string };

const sum = (entries: Entry[] = [], dir: string) =>
  entries.filter((e) => e.direction === dir).reduce((a, e) => a + Number(e.amountMinor), 0);

export default function LedgerIntegrityPage() {
  const [rows, setRows] = useState<Txn[]>([]);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Txn[]>('/admin/ledger/transactions').then(setRows).catch((e) => setError(e.message));
    adminGet<Integrity>('/admin/ledger/integrity').then(setIntegrity).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!integrity) return <LoadingState label="Checking ledger integrity…" />;

  const imbalanced = rows.filter((t) => sum(t.entries, 'DEBIT') !== sum(t.entries, 'CREDIT'));

  return (
    <>
      <PageHeader
        title="Ledger Integrity"
        kicker="Financial inconsistency checks must be impossible to miss before payout approvals."
      />
      <LedgerIntegrityPanel ok={integrity.ok} unbalanced={integrity.unbalancedTransactions} />
      <br />
      <DataTable columns={['Transaction', 'Affected users', 'Debits', 'Credits', 'Recommended action']} empty={<EmptyState>Ledger balanced. No imbalanced transactions detected.</EmptyState>}>
        {imbalanced.map((t) => {
          // imbalanced txns always have entries (sum() of [] is balanced and filtered out); ?? [] is a TS guard only
          const users = Array.from(new Set((t.entries ?? /* v8 ignore next */ []).map((e) => e.account?.userId).filter(Boolean)));
          const d = sum(t.entries, 'DEBIT');
          const c = sum(t.entries, 'CREDIT');
          return (
            <tr className="ledger-imbalance" key={t.id}>
              <td><code>{t.id}</code><br />{t.type}</td>
              <td>{users.length ? users.map((u) => String(u).slice(0, 8)).join(', ') : '—'}</td>
              <td>{d}</td>
              <td>{c}</td>
              <td>Disable payout approvals until resolved.</td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
