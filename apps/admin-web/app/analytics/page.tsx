"use client";

import { useEffect, useState } from "react";
import { adminGet } from "../../lib/api";
import { ErrorState, MetricCard, PageHeader } from "../admin-ui";
import { Sparkline } from "../Sparkline";

type Overview = {
  users: number;
  creators: number;
  rooms: number;
  giftTransactions: number;
  giftVolumeCoins: number | string;
};

type SeriesPoint = { day: string; newUsers: number; giftCount: number; giftVolumeCoins: number };

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Overview>("/admin/analytics/overview").then(setData).catch((e: any) => setError(e.message));
    // Trends are an optional widget — a failure here must not error the whole page.
    adminGet<SeriesPoint[]>("/admin/analytics/series?days=30")
      .then(setSeries)
      .catch((e) => console.warn("Analytics series widget failed to load", e));
  }, []);

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Analytics" kicker="Platform totals and 30-day trends across users, creators, live rooms, and gifting." />
      <div className="metric-grid">
        <MetricCard label="Users" value={data?.users ?? "—"} tone="neutral" />
        <MetricCard label="Creators" value={data?.creators ?? "—"} tone="neutral" />
        <MetricCard label="Live rooms (all time)" value={data?.rooms ?? "—"} tone="neutral" />
        <MetricCard label="Gifts sent" value={data?.giftTransactions ?? "—"} tone="good" />
        <MetricCard label="Gift volume (coins)" value={data ? Number(data.giftVolumeCoins).toLocaleString() : "—"} tone="good" />
      </div>
      {series && series.length > 0 ? (
        <section className="side-panel" style={{ marginTop: 24 }}>
          <h3>Trends (30 days)</h3>
          <Sparkline label="New users / day" values={series.map((p) => p.newUsers)} accent="#14b8a6" />
          <Sparkline label="Gifts sent / day" values={series.map((p) => p.giftCount)} accent="#7c3aed" />
          <Sparkline label="Gift volume (coins) / day" values={series.map((p) => p.giftVolumeCoins)} accent="#ffc857" />
        </section>
      ) : null}
    </>
  );
}
