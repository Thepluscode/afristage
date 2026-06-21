"use client";

import { useEffect, useState } from "react";
import { adminGet } from "../../lib/api";
import { ErrorState, MetricCard, PageHeader } from "../admin-ui";

type Overview = {
  users: number;
  creators: number;
  rooms: number;
  giftTransactions: number;
  giftVolumeCoins: number | string;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Overview>("/admin/analytics/overview").then(setData).catch((e: any) => setError(e.message));
  }, []);

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Analytics" kicker="Platform totals across users, creators, live rooms, and gifting." />
      <div className="metric-grid">
        <MetricCard label="Users" value={data?.users ?? "—"} tone="neutral" />
        <MetricCard label="Creators" value={data?.creators ?? "—"} tone="neutral" />
        <MetricCard label="Live rooms (all time)" value={data?.rooms ?? "—"} tone="neutral" />
        <MetricCard label="Gifts sent" value={data?.giftTransactions ?? "—"} tone="good" />
        <MetricCard label="Gift volume (coins)" value={data?.giftVolumeCoins ?? "—"} tone="good" />
      </div>
    </>
  );
}
