'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminPost } from '../../lib/api';
import { ActionMenu, ConfirmDialog, DataTable, EmptyState, ErrorState, MoneyAmount, PageHeader, PayoutActionPanel, PromptDialog, StatusBadge, UserCell, WarningBanner } from '../admin-ui';
import { useRowHighlight } from '../highlight';

type Payout = {
  id: string;
  coinAmount: string | number;
  fiatMinor: string | number;
  fiatCurrency: string;
  status: string;
  creatorUserId: string;
  createdAt: string;
  payoutProvider?: string | null;
  payoutDestinationLabel?: string | null;
  payoutDestinationReference?: string | null;
  payoutCountry?: string | null;
  providerReference?: string | null;
  creator?: { email?: string; profile?: { displayName?: string; username?: string }; creatorProfile?: { stageName?: string } };
};
// Mask the destination so reviewers can match it without exposing full account numbers.
function maskRef(ref?: string | null) {
  if (!ref) return '';
  return ref.length <= 4 ? ref : `•••• ${ref.slice(-4)}`;
}
type Integrity = { ok: boolean; unbalancedTransactions: number };
type Risk = { riskScore: number; recommendedAction: 'NONE' | 'SOFT_FLAG' | 'MANUAL_REVIEW' | 'PAYOUT_HOLD' };

export default function PayoutsPage() {
  const [rows, setRows] = useState<Payout[]>([]);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [risk, setRisk] = useState<Record<string, Risk>>({});
  const [error, setError] = useState<string | null>(null);
  const highlightId = useRowHighlight(rows);

  async function load() {
    try {
      const data = await adminGet<Payout[]>('/admin/payouts');
      setRows(data);
      // Fraud assessment per creator with an actionable payout — surfaces risk
      // right where the money decision is made. ponytail: one fetch per distinct
      // pending creator; fine at beta volume, batch server-side if it grows.
      const ids = [...new Set(data.filter((p) => ['UNDER_REVIEW', 'HELD'].includes(p.status)).map((p) => p.creatorUserId))];
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, await adminGet<Risk>(`/admin/fraud/creators/${id}`)] as const;
          } catch {
            return null;
          }
        })
      );
      setRisk(Object.fromEntries(entries.filter(Boolean) as (readonly [string, Risk])[]));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    adminGet<Integrity>('/admin/ledger/integrity').then(setIntegrity).catch(() => {});
  }, []);

  async function action(id: string, verb: string, body?: unknown) {
    await adminPost(`/admin/payouts/${id}/${verb}`, body);
    await load();
  }

  if (error) return <ErrorState error={error} />;
  const ledgerBlocked = integrity?.ok === false;

  return (
    <>
      <PageHeader title="Payouts" kicker="Strict payout queue for review, hold, approval, rejection, and paid confirmation." />
      {ledgerBlocked ? (
        <WarningBanner>Ledger imbalance detected. Do not approve payouts until integrity is resolved.</WarningBanner>
      ) : null}
      <div className="command-grid">
        <section>
          <DataTable columns={['Creator', 'Coins', 'Fiat', 'Status', 'Requested', 'Method', 'Risk flags', 'Hold', 'Reviewer', 'Actions']} empty={<EmptyState>No payout requests yet.</EmptyState>}>
            {rows.map((p) => (
              <tr key={p.id} id={`row-${p.id}`} className={p.id === highlightId ? 'row-highlight' : undefined}>
                <td><UserCell name={p.creator?.creatorProfile?.stageName || p.creator?.profile?.displayName || p.creator?.email} sub={p.creatorUserId} /></td>
                <td>{p.coinAmount}</td>
                <td><MoneyAmount minor={p.fiatMinor} currency={p.fiatCurrency} /></td>
                <td>
                  <StatusBadge status={p.status} />
                  {p.status === 'PAID' && p.providerReference ? <div className="pill balanced">ref {p.providerReference}</div> : null}
                </td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td>
                  {p.payoutProvider ? (
                    <>
                      <div>{p.payoutDestinationLabel || p.payoutProvider}</div>
                      <span className="pill">{p.payoutProvider}{p.payoutCountry ? ` · ${p.payoutCountry}` : ''} {maskRef(p.payoutDestinationReference)}</span>
                    </>
                  ) : (
                    <span className="pill danger">No destination</span>
                  )}
                </td>
                <td>
                  {risk[p.creatorUserId] ? (
                    <>
                      <StatusBadge status={risk[p.creatorUserId].recommendedAction} />{' '}
                      <span className="pill">{risk[p.creatorUserId].riskScore.toFixed(2)}</span>
                    </>
                  ) : ledgerBlocked ? (
                    <span className="pill danger">LEDGER BLOCK</span>
                  ) : (
                    <span className="pill balanced">NORMAL</span>
                  )}
                </td>
                <td>0</td>
                <td>Unassigned</td>
                <td>
                  <ActionMenu>
                  {p.status === 'HELD' ? (
                    <button className="button secondary" onClick={() => action(p.id, 'release')}>Release Hold</button>
                  ) : null}
                  <PromptDialog
                    triggerLabel="Hold Payout"
                    title="Hold payout"
                    inputLabel="Hold reason"
                    placeholder="Why hold this payout?"
                    confirmLabel="Hold Payout"
                    disabled={p.status !== 'UNDER_REVIEW'}
                    onSubmit={(reason) => action(p.id, 'hold', { reason: reason || 'admin hold' })}
                  />
                  <ConfirmDialog
                    triggerLabel="Approve Payout"
                    title="Approve payout"
                    body={`Approve payout of ${p.coinAmount} coins (${p.fiatMinor} ${p.fiatCurrency} minor)? This authorises a real money transfer and cannot be casually undone.`}
                    confirmLabel="Approve"
                    disabled={ledgerBlocked || !['UNDER_REVIEW', 'HELD'].includes(p.status)}
                    onConfirm={() => action(p.id, 'approve')}
                  />
                  <PromptDialog
                    triggerLabel="Reject Payout"
                    title="Reject payout"
                    inputLabel="Rejection reason"
                    placeholder="Why reject?"
                    confirmLabel="Reject Payout"
                    disabled={!['UNDER_REVIEW', 'HELD'].includes(p.status)}
                    onSubmit={(reason) => action(p.id, 'reject', { reason: reason || 'Rejected by admin' })}
                  />
                  <PromptDialog
                    triggerLabel="Mark Paid"
                    title="Mark payout paid"
                    body="Only mark paid after confirming the external transfer. The reference keeps PAID reconcilable."
                    inputLabel="External transfer reference"
                    placeholder="bank/Paystack transaction id"
                    confirmLabel="Mark Paid"
                    required
                    disabled={p.status !== 'APPROVED'}
                    onSubmit={(reference) => action(p.id, 'mark-paid', { reference })}
                  />
                  </ActionMenu>
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
        <PayoutActionPanel blocked={ledgerBlocked} />
      </div>
    </>
  );
}
