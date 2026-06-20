'use client';

import { useEffect, useState } from 'react';
import { adminGet } from '../../lib/api';
import { DataTable, EmptyState, ErrorState, LedgerIntegrityPanel, PageHeader, StatusBadge } from '../admin-ui';

type Entry = { direction: string; amountMinor: string | number };
type Txn = {
  id: string;
  type: string;
  status: string;
  externalReference?: string | null;
  createdAt: string;
  entries?: Entry[];
};
type Integrity = { ok: boolean; unbalancedTransactions: number };

const sum = (entries: Entry[] = [], dir: string) =>
  entries.filter((e) => e.direction === dir).reduce((a, e) => a + Number(e.amountMinor), 0);

export default function LedgerPage() {
  const [rows, setRows] = useState<Txn[]>([]);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Txn[]>('/admin/ledger/transactions').then(setRows).catch((e) => setError(e.message));
    adminGet<Integrity>('/admin/ledger/integrity').then(setIntegrity).catch(() => {});
  }, []);

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Ledger" kicker="Transaction ledger with debit/credit visibility for investigation and reconciliation." />
      {integrity ? <LedgerIntegrityPanel ok={integrity.ok} unbalanced={integrity.unbalancedTransactions} /> : null}
      <br />
      <DataTable columns={['Type', 'Status', 'Reference', 'Entries', 'Debits', 'Credits', 'Created']} empty={<EmptyState>No ledger transactions.</EmptyState>}>
            {rows.map((t) => {
              const d = sum(t.entries, 'DEBIT');
              const c = sum(t.entries, 'CREDIT');
              return (
                <tr key={t.id} className={d !== c ? 'ledger-imbalance' : undefined}>
                  <td>{t.type}</td>
                  <td><StatusBadge status={d === c ? t.status : 'IMBALANCED'} /></td>
                  <td>{t.externalReference || '—'}</td>
                  <td>{t.entries?.length ?? 0}</td>
                  <td>{d}</td>
                  <td>{c}</td>
                  <td>{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
      </DataTable>
    </>
  );
}
