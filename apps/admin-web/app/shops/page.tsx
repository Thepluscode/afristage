"use client";

import { FormEvent, Suspense, useState } from "react";
import { adminGet, adminPatch, adminPost } from "../../lib/api";
import { ConfirmDialog, DataTable, EmptyState, ErrorState, FilterBar, PageHeader, StatusBadge } from "../admin-ui";
import { RowHighlightNotice, useRowHighlight } from "../highlight";
import { useAdminResource } from "../../lib/use-admin-resource";

type ShopStatus = "PENDING" | "APPROVED" | "SUSPENDED";

type ShopRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  externalUrl?: string | null;
  status: ShopStatus;
  createdAt: string;
  ownerUserId: string;
  _count?: { products: number; orders: number };
};

type ProductRow = {
  id: string;
  title: string;
  priceCoins: number;
  stock: number | null;
  externalUrl?: string | null;
  clickCount: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

type ShopDetail = {
  shop: ShopRow & {
    owner: { id: string; email: string | null; profile: { displayName: string; username: string } | null };
  };
  products: ProductRow[];
};

function ShopsPageInner() {
  const { data: rows, error, setError, reload } = useAdminResource<ShopRow[]>(
    () => adminGet<ShopRow[]>("/admin/shops"),
    [],
  );
  const [expanded, setExpanded] = useState<ShopDetail | null>(null);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [name, setName] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const { id: highlightId, missing } = useRowHighlight(rows);

  async function openDetail(id: string) {
    setError(null);
    try {
      setExpanded(await adminGet<ShopDetail>(`/admin/shops/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }

  // Onboarding a referral brand (Bronzea): its products link out rather than
  // selling in-app, so leaving the URL blank creates an ordinary in-app shop.
  async function createShop(e: FormEvent) {
    e.preventDefault();
    if (!ownerUserId || !name) return;
    setError(null);
    try {
      await adminPost("/admin/shops", {
        ownerUserId,
        name,
        ...(externalUrl ? { externalUrl } : {}),
      });
      setOwnerUserId("");
      setName("");
      setExternalUrl("");
      await reload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function setStatus(shop: ShopRow, status: ShopStatus) {
    setError(null);
    try {
      await adminPatch(`/admin/shops/${shop.id}/status`, { status });
      await reload();
      if (expanded?.shop.id === shop.id) await openDetail(shop.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (error) return <ErrorState error={error} />;

  const pending = rows.filter((s) => s.status === "PENDING").length;

  return (
    <>
      <PageHeader
        title="Shops"
        kicker="Approval is the gate that decides who may take coins from viewers. Every status change is audited."
      />
      <FilterBar onSubmit={createShop}>
        <input placeholder="Owner user id" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} />
        <input placeholder="Shop name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="Referral URL (blank = sells in-app)"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
        />
        <button className="button">Onboard Shop</button>
      </FilterBar>
      <RowHighlightNotice missing={missing} />
      {pending > 0 && (
        <p className="banner-ok">
          <strong>{pending}</strong> shop{pending === 1 ? "" : "s"} awaiting review. Nothing they list is sellable until approved.
        </p>
      )}
      {expanded && (
        <div className="table-wrap">
          <p className="banner-ok">
            <strong>{expanded.shop.name}</strong> — owner{" "}
            {expanded.shop.owner.profile?.displayName ?? expanded.shop.owner.email ?? expanded.shop.owner.id}
            {expanded.shop.externalUrl && (
              <>
                {" "}
                · referral shop, links out to <code>{expanded.shop.externalUrl}</code>
              </>
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Kind</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {expanded.products.length === 0 && (
                <tr>
                  <td colSpan={5}>Nothing listed yet.</td>
                </tr>
              )}
              {expanded.products.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>{p.priceCoins.toLocaleString()} coins</td>
                  <td>{p.stock === null ? "Unlimited" : p.stock}</td>
                  <td>{p.externalUrl ? `Link-out · ${p.clickCount} taps` : "In-app"}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5}>
                  <button className="button secondary" onClick={() => setExpanded(null)}>
                    Close
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <DataTable
        columns={["Shop", "Kind", "Products", "Orders", "Status", "Actions"]}
        empty={<EmptyState>No shops yet. Onboard a seller above, or wait for a creator to open one.</EmptyState>}
      >
        {rows.map((s) => (
          <tr key={s.id} id={`row-${s.id}`} className={s.id === highlightId ? "row-highlight" : undefined}>
            <td>
              {s.name}
              <br />
              <small>/{s.slug}</small>
            </td>
            <td>{s.externalUrl ? "Referral" : "In-app"}</td>
            <td>{s._count?.products ?? 0}</td>
            <td>{s._count?.orders ?? 0}</td>
            <td>
              <StatusBadge status={s.status} />
            </td>
            <td>
              <button className="button secondary" onClick={() => openDetail(s.id)}>
                View
              </button>
              {s.status !== "APPROVED" && (
                <button className="button" onClick={() => setStatus(s, "APPROVED")}>
                  Approve
                </button>
              )}
              {s.status === "APPROVED" && (
                <ConfirmDialog
                  title="Suspend shop"
                  body={`Suspend ${s.name}? Its products stop being sellable and disappear from every live room immediately. Existing orders are untouched.`}
                  confirmLabel="Suspend"
                  onConfirm={() => setStatus(s, "SUSPENDED")}
                />
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

export default function ShopsPage() {
  return (
    <Suspense fallback={null}>
      <ShopsPageInner />
    </Suspense>
  );
}
