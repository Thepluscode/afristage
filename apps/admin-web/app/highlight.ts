'use client';

import { useEffect, useState } from 'react';

// Reads the `?id=` search param once, then scrolls the matching row
// (id="row-<id>") into view when the data it lives in is ready. Returns the id
// so callers can visually highlight that row. Used for search click-through.
export function useRowHighlight(ready: unknown): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(`row-${id}`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [id, ready]);

  return id;
}
