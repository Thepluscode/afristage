"use client";

import { useEffect, useState } from "react";
import { adminGet } from "../../lib/api";
import { ErrorState, FilterBar, PageHeader, StatusBadge } from "../admin-ui";

type Creator = { userId: string; stageName: string };

type Signal = { key: string; triggered: boolean; weight: number; detail: string };
type Assessment = {
  userId: string;
  riskScore: number;
  recommendedAction: "NONE" | "SOFT_FLAG" | "MANUAL_REVIEW" | "PAYOUT_HOLD";
  signals: Signal[];
};

export default function FraudPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selected, setSelected] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminGet<Creator[]>("/admin/creators").then(setCreators).catch((e) => setError(e.message));
  }, []);

  async function assess() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      setAssessment(await adminGet<Assessment>(`/admin/fraud/creators/${selected}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Fraud" kicker="Explainable risk assessment for a creator before approving payouts." />

      <FilterBar onSubmit={(e) => { e.preventDefault(); assess(); }}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select a creator…</option>
          {creators.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.stageName} ({c.userId.slice(0, 8)}…)
            </option>
          ))}
        </select>
        <button type="submit" disabled={!selected || loading}>
          {loading ? "Assessing…" : "Assess risk"}
        </button>
      </FilterBar>

      {assessment && (
        <>
          <p className={assessment.recommendedAction === "NONE" ? "banner-ok" : "banner-warn"}>
            Risk score <strong>{assessment.riskScore.toFixed(2)}</strong> — recommended action{" "}
            <StatusBadge status={assessment.recommendedAction} />
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
                {assessment.signals.map((s) => (
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
    </>
  );
}
