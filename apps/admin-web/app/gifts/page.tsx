"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminGet, adminPost, adminPatch } from "../../lib/api";
import { ActionMenu, ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge } from "../admin-ui";

type Gift = {
  id: string;
  name: string;
  coinPrice: number;
  isActive: boolean;
  animationUrl?: string | null;
};

export default function GiftsPage() {
  const [rows, setRows] = useState<Gift[]>([]);
  const [name, setName] = useState("");
  const [coinPrice, setCoinPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await adminGet<Gift[]>("/gifts"));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name || !coinPrice) return;
    await adminPost("/admin/gifts", { name, coinPrice: Number(coinPrice) });
    setName("");
    setCoinPrice("");
    await load();
  }

  async function editPrice(g: Gift) {
    const v = prompt(`New coin price for ${g.name}`, String(g.coinPrice));
    if (v == null) return;
    await adminPatch(`/admin/gifts/${g.id}`, { coinPrice: Number(v) });
    await load();
  }

  async function toggle(g: Gift) {
    await adminPatch(`/admin/gifts/${g.id}`, { isActive: !g.isActive });
    await load();
  }

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader
        title="Gifts"
        kicker="Manage gift pricing, availability, and animation assets with clear operator audit intent."
      />
      <FilterBar onSubmit={create}>
        <input
          placeholder="Gift name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Coins"
          type="number"
          value={coinPrice}
          onChange={(e) => setCoinPrice(e.target.value)}
        />
        <button className="button">Create Gift</button>
      </FilterBar>
      <DataTable columns={["Gift", "Coins", "Status", "Animation", "Actions"]} empty={<EmptyState>No gifts have been configured.</EmptyState>}>
            {rows.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{g.coinPrice}</td>
                <td><StatusBadge status={g.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                <td>{g.animationUrl ? <span className="pill success">Configured</span> : <span className="pill warning">Missing</span>}</td>
                <td>
                  <ActionMenu>
                  <button
                    className="button secondary"
                    onClick={() => editPrice(g)}
                  >
                    Edit Price
                  </button>
                  {g.isActive ? (
                    <ConfirmDialog title="Disable gift" body={`Disable ${g.name}? Viewers can no longer buy or send it.`} confirmLabel="Disable" onConfirm={() => toggle(g)} />
                  ) : (
                    <button className="button" onClick={() => toggle(g)}>Enable Gift</button>
                  )}
                  </ActionMenu>
                </td>
              </tr>
            ))}
      </DataTable>
    </>
  );
}
