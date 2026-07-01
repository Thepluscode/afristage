"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { adminGet, adminPost, adminPatch } from "../../lib/api";
import { ActionMenu, ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, PromptDialog, StatusBadge } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";

type Gift = {
  id: string;
  name: string;
  coinPrice: number;
  isActive: boolean;
  animationUrl?: string | null;
};

function GiftsPageInner() {
  const [rows, setRows] = useState<Gift[]>([]);
  const [name, setName] = useState("");
  const [coinPrice, setCoinPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { id: highlightId, missing } = useRowHighlight(rows);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingGift = useRef<string | null>(null);

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

  function pickAnimation(g: Gift) {
    pendingGift.current = g.id;
    fileRef.current?.click();
  }

  // Presign -> PUT straight to object storage -> save the CDN URL on the gift.
  async function onAnimationPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const giftId = pendingGift.current;
    e.target.value = ""; // allow re-picking the same file
    if (!file || !giftId) return;
    setUploadingId(giftId);
    setError(null);
    try {
      const { uploadUrl, fileUrl } = await adminPost<{ uploadUrl: string; fileUrl: string }>("/uploads/presign", {
        contentType: file.type,
        kind: "gift_animation",
      });
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await adminPatch(`/admin/gifts/${giftId}`, { animationUrl: fileUrl });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingId(null);
      pendingGift.current = null;
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name || !coinPrice) return;
    await adminPost("/admin/gifts", { name, coinPrice: Number(coinPrice) });
    setName("");
    setCoinPrice("");
    await load();
  }

  async function editPrice(g: Gift, value: string) {
    await adminPatch(`/admin/gifts/${g.id}`, { coinPrice: Number(value) });
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
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/webp,image/gif,image/jpeg"
        style={{ display: "none" }}
        onChange={onAnimationPicked}
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
      <RowHighlightNotice missing={missing} />
      <DataTable columns={["Gift", "Coins", "Status", "Animation", "Actions"]} empty={<EmptyState>No gifts have been configured.</EmptyState>}>
            {rows.map((g) => (
              <tr key={g.id} id={`row-${g.id}`} className={g.id === highlightId ? 'row-highlight' : undefined}>
                <td>{g.name}</td>
                <td>{g.coinPrice}</td>
                <td><StatusBadge status={g.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                <td>{g.animationUrl ? <span className="pill success">Configured</span> : <span className="pill warning">Missing</span>}</td>
                <td>
                  <ActionMenu>
                  <PromptDialog
                    triggerLabel="Edit Price"
                    title="Edit price"
                    body={`Set a new coin price for ${g.name}.`}
                    inputLabel="Coin price"
                    placeholder="Coins"
                    defaultValue={String(g.coinPrice)}
                    confirmLabel="Save Price"
                    required
                    onSubmit={(v) => editPrice(g, v)}
                  />
                  <button
                    className="button secondary"
                    disabled={uploadingId === g.id}
                    onClick={() => pickAnimation(g)}
                  >
                    {uploadingId === g.id ? "Uploading…" : g.animationUrl ? "Replace Animation" : "Upload Animation"}
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

export default function GiftsPage() {
  return (
    <Suspense fallback={null}>
      <GiftsPageInner />
    </Suspense>
  );
}
