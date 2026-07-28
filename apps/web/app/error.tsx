'use client';

import { useEffect } from 'react';

/**
 * Viewer-facing crash boundary. This surface is public and mostly unauthenticated,
 * so the copy must never blame the viewer or expose internals — it says what
 * happened, that nothing of theirs is lost, and how to get back to watching.
 */
export default function WatchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Web route error', error);
  }, [error]);

  return (
    <main className="crash-panel" role="alert">
      <h1>This page hit a snag</h1>
      <p>
        Something on our side stopped loading. Your account and your coins are safe. Try again, or
        head back to the live stages.
      </p>
      {error.digest ? (
        <p className="crash-ref">
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <div className="crash-actions">
        <button onClick={reset}>Try again</button>
        <a href="/">Back to live</a>
      </div>
    </main>
  );
}
