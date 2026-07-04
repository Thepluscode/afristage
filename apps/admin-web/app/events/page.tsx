"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { adminGet, adminPatch, adminPost } from "../../lib/api";
import { ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, PromptDialog, StatusBadge } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";

type EventRow = {
  id: string;
  name: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  prizePoolCoins: number;
  settledAt?: string | null;
  _count?: { gifts: number };
};

type SettleResult = {
  ok: boolean;
  winners: { userId: string; rank: number; coins: number }[];
  paidCoins: number;
};

function eventStatus(e: EventRow): "SETTLED" | "ENDED" | "LIVE" | "UPCOMING" {
  if (e.settledAt) return "SETTLED";
  const now = Date.now();
  if (now > new Date(e.endsAt).getTime()) return "ENDED";
  if (now >= new Date(e.startsAt).getTime()) return "LIVE";
  return "UPCOMING";
}

function EventsPageInner() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pool, setPool] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<{ name: string; result: SettleResult } | null>(null);
  const { id: highlightId, missing } = useRowHighlight(rows);

  async function load() {
    try {
      setRows(await adminGet<EventRow[]>("/admin/events"));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name || !startsAt || !endsAt) return;
    setError(null);
    try {
      await adminPost("/admin/events", {
        name,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        ...(pool ? { prizePoolCoins: Number(pool) } : {}),
      });
      setName("");
      setStartsAt("");
      setEndsAt("");
      setPool("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function editPool(ev: EventRow, value: string) {
    await adminPatch(`/admin/events/${ev.id}`, { prizePoolCoins: Number(value) });
    await load();
  }

  async function settle(ev: EventRow) {
    setError(null);
    try {
      const result = await adminPost<SettleResult>(`/admin/events/${ev.id}/settle`);
      setSettled({ name: ev.name, result });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (error) return <ErrorState error={error} />;

  const fmt = (iso: string) => new Date(iso).toLocaleString();

  return (
    <>
      <PageHeader
        title="Events"
        kicker="Limited-time campaigns: window, exclusive gifts, and the PROMO-funded prize pool settled over the supporter leaderboard."
      />
      <FilterBar onSubmit={create}>
        <input placeholder="Event name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="datetime-local" aria-label="Starts at" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input type="datetime-local" aria-label="Ends at" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        <input placeholder="Prize pool coins" type="number" value={pool} onChange={(e) => setPool(e.target.value)} />
        <button className="button">Create Event</button>
      </FilterBar>
      {settled && (
        <p className="banner-ok">
          Settled <strong>{settled.name}</strong>:{" "}
          {settled.result.winners.length === 0
            ? "no qualifying supporters — the pool stays in PROMO."
            : `paid ${settled.result.paidCoins} coins to ${settled.result.winners.length} winner(s): ` +
              settled.result.winners.map((w) => `#${w.rank} → ${w.coins}c`).join(", ")}
        </p>
      )}
      <RowHighlightNotice missing={missing} />
      <DataTable
        columns={["Event", "Window", "Gifts", "Prize Pool", "Status", "Actions"]}
        empty={<EmptyState>No events yet. Create the first limited-time campaign above.</EmptyState>}
      >
        {rows.map((ev) => {
          const status = eventStatus(ev);
          return (
            <tr key={ev.id} id={`row-${ev.id}`} className={ev.id === highlightId ? "row-highlight" : undefined}>
              <td>{ev.name}</td>
              <td>
                {fmt(ev.startsAt)} → {fmt(ev.endsAt)}
              </td>
              <td>{ev._count?.gifts ?? 0}</td>
              <td>{ev.prizePoolCoins > 0 ? `${ev.prizePoolCoins} coins` : "—"}</td>
              <td>
                <StatusBadge status={status} />
              </td>
              <td>
                {status === "SETTLED" ? (
                  <span className="pill success">Paid out</span>
                ) : (
                  <>
                    <PromptDialog
                      triggerLabel="Edit Pool"
                      title="Edit prize pool"
                      body={`Set the prize-pool commitment for ${ev.name}. Paid from PROMO at settle time.`}
                      inputLabel="Prize pool coins"
                      placeholder="Coins"
                      defaultValue={String(ev.prizePoolCoins)}
                      confirmLabel="Save Pool"
                      required
                      onSubmit={(v) => editPool(ev, v)}
                    />
                    {status === "ENDED" && ev.prizePoolCoins > 0 && (
                      <ConfirmDialog
                        title="Settle prize pool"
                        body={`Pay ${ev.prizePoolCoins} coins from PROMO to the top supporters of ${ev.name} (50/30/20)? This cannot be undone.`}
                        confirmLabel="Settle"
                        onConfirm={() => settle(ev)}
                      />
                    )}
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsPageInner />
    </Suspense>
  );
}
