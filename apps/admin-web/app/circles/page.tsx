"use client";

import { Suspense, useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { DataTable, EmptyState, ErrorState, PageHeader, StatusBadge } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";

type CircleRow = {
  id: string;
  name: string;
  city?: string | null;
  createdAt: string;
  _count?: { members: number };
};

type GroupSignal = { key: string; triggered: boolean; weight: number; detail: string };
type GroupAssessment = {
  userIds: string[];
  riskScore: number;
  recommendedAction: "NONE" | "SOFT_FLAG" | "MANUAL_REVIEW" | "PAYOUT_HOLD";
  signals: GroupSignal[];
};

function CirclesPageInner() {
  const [rows, setRows] = useState<CircleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assessing, setAssessing] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<{ name: string; result: GroupAssessment } | null>(null);
  const { id: highlightId, missing } = useRowHighlight(rows);

  useEffect(() => {
    adminGet<CircleRow[]>("/circles")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  async function assess(c: CircleRow) {
    setAssessing(c.id);
    setError(null);
    try {
      const result = await adminPost<GroupAssessment>(`/admin/circles/${c.id}/assess`);
      setAssessment({ name: c.name, result });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssessing(null);
    }
  }

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader
        title="Circles"
        kicker="Fan groups pooling gift + mission points. Assess runs the group-fraud scorer over a circle's membership — the collusion guardrail."
      />
      <RowHighlightNotice missing={missing} />
      {assessment && (
        <>
          <p className={assessment.result.recommendedAction === "NONE" ? "banner-ok" : "banner-warn"}>
            <strong>{assessment.name}</strong> ({assessment.result.userIds.length} members) — risk score{" "}
            <strong>{assessment.result.riskScore.toFixed(2)}</strong>, recommended action{" "}
            <StatusBadge status={assessment.result.recommendedAction} />
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Signal</th>
                  <th>Triggered</th>
                  <th>Weight</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {assessment.result.signals.map((s) => (
                  <tr key={s.key}>
                    <td>{s.key}</td>
                    <td>{s.triggered ? "⚠️ yes" : "—"}</td>
                    <td>{s.weight.toFixed(2)}</td>
                    <td>{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <DataTable
        columns={["Circle", "City", "Members", "Created", "Actions"]}
        empty={<EmptyState>No circles yet — they appear as soon as viewers create them in the app.</EmptyState>}
      >
        {rows.map((c) => (
          <tr key={c.id} id={`row-${c.id}`} className={c.id === highlightId ? "row-highlight" : undefined}>
            <td>{c.name}</td>
            <td>{c.city ?? "—"}</td>
            <td>{c._count?.members ?? 0}</td>
            <td>{new Date(c.createdAt).toLocaleDateString()}</td>
            <td>
              <button className="button secondary" disabled={assessing === c.id} onClick={() => assess(c)}>
                {assessing === c.id ? "Assessing…" : "Assess Fraud"}
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

export default function CirclesPage() {
  return (
    <Suspense fallback={null}>
      <CirclesPageInner />
    </Suspense>
  );
}
