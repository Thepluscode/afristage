'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// Reactively tracks the `?id=` search param (updates even when re-searching on
// the same route), scrolls the matching row (id="row-<id>") into view when the
// data loads, and reports whether the requested id is absent from the loaded
// rows so callers can surface a "not in this view" hint. Pass the rows that are
// actually loaded.
export function useRowHighlight(rows: { id: string }[]): { id: string | null; missing: boolean } {
  const params = useSearchParams();
  const id = params?.get('id') ?? null;
  const missing = Boolean(id) && rows.length > 0 && !rows.some((r) => r.id === id);

  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(`row-${id}`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [id, rows]);

  return { id, missing };
}

// Shown when a search click-through targets a record that isn't in the loaded
// list (older than the recent window, or filtered out).
export function RowHighlightNotice({ missing }: { missing: boolean }) {
  if (!missing) return null;
  return (
    <div className="row-missing-note">
      The linked record isn’t in this list — it may be older than the recent window or filtered out.
    </div>
  );
}
