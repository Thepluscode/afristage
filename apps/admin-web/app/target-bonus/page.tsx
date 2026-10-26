"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/api";
import { ConfirmDialog, DangerBanner, DataTable, EmptyState, FilterBar, PageHeader, StatusBadge, SuccessBanner } from "../admin-ui";

type Tier = { minGiftCoins: number; bonusCoins: number };
type Award = { userId: string; displayName: string; giftCoins: number; bonusCoins: number };
type MonthView = {
  month: string;
  closed: boolean;
  payableFrom: string;
  paid: { ledgerTransactionId: string; paidAt: string } | null;
  tiers: Tier[];
  awards: Award[];
  totalBonusCoins: number;
  promoBalanceCoins: string;
  alreadyPaid?: boolean;
};

// The month that most recently closed, as YYYY-MM (UTC, matching the API).
function lastClosedMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStatus(v: MonthView): "PAID" | "OPEN" | "READY" | "NONE" {
  if (v.paid) return "PAID";
  if (!v.closed) return "OPEN";
  return v.awards.length ? "READY" : "NONE";
}

const n = (x: number | string) => Number(x).toLocaleString();

export default function TargetBonusPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [month, setMonth] = useState(lastClosedMonth());
  const [view, setView] = useState<MonthView | null>(null);
  const [fund, setFund] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // Plain fetch, no banner reset — other actions call it after setting their notice.
  const refreshMonth = async () => setView(await adminGet<MonthView>(`/admin/target-bonus/months/${month}`));
  const loadMonth = () => act(refreshMonth);

  useEffect(() => {
    act(async () => {
      setTiers(await adminGet<Tier[]>("/admin/target-bonus/tiers"));
      await refreshMonth();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTier = (i: number, key: keyof Tier, value: string) =>
    setTiers(tiers.map((t, j) => (j === i ? { ...t, [key]: Number(value) } : t)));

  const saveTiers = () =>
    act(async () => {
      const saved = await adminPost<Tier[]>("/admin/target-bonus/tiers", { tiers });
      setTiers(saved);
      setNotice(saved.length ? `Saved ${saved.length} tier(s).` : "Ladder cleared — no host bonuses will be paid.");
      await refreshMonth();
    });

  const fundPromo = (e: FormEvent) => {
    e.preventDefault();
    if (!fund) return;
    act(async () => {
      await adminPost("/admin/missions/fund", { coins: Number(fund) });
      setNotice(`Moved ${n(fund)} coins from platform revenue into the promo budget.`);
      setFund("");
      await refreshMonth();
    });
  };

  const pay = () =>
    act(async () => {
      const res = await adminPost<MonthView>(`/admin/target-bonus/months/${month}/pay`);
      setView(res);
      setNotice(
        res.alreadyPaid
          ? `${month} was already paid — nothing was paid twice.`
          : res.paid
            ? `Paid ${n(res.totalBonusCoins)} bonus coins to ${res.awards.length} host(s) for ${month}.`
            : `No host reached a tier in ${month}; nothing was paid.`,
      );
    });

  const status = view ? monthStatus(view) : null;

  return (
    <>
      <PageHeader
        title="Host Bonuses"
        kicker="Monthly target bonus: one ladder for every host. Gift coins received in a calendar month (UTC) decide the tier; the highest tier reached is paid from the promo budget, on top of normal earnings."
      />
      {error && <DangerBanner>{error}</DangerBanner>}
      {notice && <SuccessBanner>{notice}</SuccessBanner>}

      <h2>Bonus ladder</h2>
      <DataTable columns={["Gift coins received in the month", "Bonus coins", ""]} empty={<EmptyState>No tiers — bonuses are off. Add one below.</EmptyState>}>
        {tiers.map((t, i) => (
          <tr key={i}>
            <td>
              <input aria-label={`Tier ${i + 1} target`} type="number" min={1} value={t.minGiftCoins || ""} onChange={(e) => setTier(i, "minGiftCoins", e.target.value)} />
            </td>
            <td>
              <input aria-label={`Tier ${i + 1} bonus`} type="number" min={1} value={t.bonusCoins || ""} onChange={(e) => setTier(i, "bonusCoins", e.target.value)} />
            </td>
            <td>
              <button className="button secondary" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                Remove
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      <p>
        <button className="button secondary" onClick={() => setTiers([...tiers, { minGiftCoins: 0, bonusCoins: 0 }])}>
          Add tier
        </button>{" "}
        <button className="button" onClick={saveTiers}>
          Save ladder
        </button>
      </p>

      <h2>Promo budget</h2>
      <FilterBar onSubmit={fundPromo}>
        <span>{view ? `${n(view.promoBalanceCoins)} coins available` : "—"}</span>
        <input aria-label="Coins to move into promo" placeholder="Coins" type="number" min={1} value={fund} onChange={(e) => setFund(e.target.value)} />
        <button className="button">Fund from platform revenue</button>
      </FilterBar>

      <h2>Pay a month</h2>
      <FilterBar
        onSubmit={(e) => {
          e.preventDefault();
          loadMonth();
        }}
      >
        <input aria-label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="button secondary">Load month</button>
        {status && <StatusBadge status={status} />}
      </FilterBar>
      {view && (
        <>
          <p>
            {status === "PAID" && `Paid ${new Date(view.paid!.paidAt).toLocaleString()} · ledger ${view.paid!.ledgerTransactionId}`}
            {status === "OPEN" && `${view.month} is still running. It can be paid from ${new Date(view.payableFrom).toLocaleString()}.`}
            {status === "READY" && `${view.awards.length} host(s) qualify for ${n(view.totalBonusCoins)} bonus coins.`}
            {status === "NONE" && `No host reached a tier in ${view.month}.`}
          </p>
          <DataTable columns={["Host", "Gift coins received", "Bonus"]} empty={<EmptyState>No qualifying hosts.</EmptyState>}>
            {view.awards.map((a) => (
              <tr key={a.userId}>
                <td>{a.displayName}</td>
                <td>{n(a.giftCoins)}</td>
                <td>{n(a.bonusCoins)} coins</td>
              </tr>
            ))}
          </DataTable>
          {status === "READY" && (
            <ConfirmDialog
              title={`Pay ${view.month} bonuses`}
              body={`Pay ${n(view.totalBonusCoins)} coins from the promo budget (${n(view.promoBalanceCoins)} available) to ${view.awards.length} host(s)? A month can only be paid once.`}
              confirmLabel={`Pay ${view.month}`}
              onConfirm={pay}
            />
          )}
        </>
      )}
    </>
  );
}
