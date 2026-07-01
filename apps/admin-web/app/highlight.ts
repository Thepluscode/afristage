'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// Reactively tracks the `?id=` search param (updates even when re-searching on
// the same route), scrolls the matching row (id="row-<id>") into view when the
// data it lives in is ready, and returns the id so callers can highlight it.
export function useRowHighlight(ready: unknown): string | null {
  const params = useSearchParams();
  const id = params?.get('id') ?? null;

  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(`row-${id}`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [id, ready]);

  return id;
}
