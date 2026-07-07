'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The controller shell every table page used to hand-roll (architecture
// candidate #5): rows/error state, a bespoke load() with try/catch→setError,
// useEffect-on-mount, and the action→reload idiom. Pages now own only their
// loader closure and their render.
//
// The loader is read through a ref at call time, so a closure over page state
// (e.g. the users page's search query) always sees the latest value — a
// submit-triggered reload() picks up state committed by earlier renders.
export function useAdminResource<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, setError, reload };
}
