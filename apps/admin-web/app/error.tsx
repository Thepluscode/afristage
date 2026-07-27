'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary. Without this a render crash anywhere under /app
 * gives the operator Next's bare "Application error: a client-side exception has
 * occurred" — no context, no way back, nothing to quote to support.
 *
 * `digest` is the server-side hash Next assigns to the error; it is the only
 * handle that ties what the user saw to what the logs recorded, so it is shown.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Admin route error', error);
  }, [error]);

  return (
    <div className="crash-panel" role="alert">
      <h2>Something broke on this screen</h2>
      <p>
        The page failed to render. Your session is still valid — retrying usually works. If it keeps
        happening, send the reference below to engineering.
      </p>
      {error.digest ? (
        <p className="crash-ref">
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <div className="actions">
        <button className="button" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/">
          Back to Mission Control
        </Link>
      </div>
    </div>
  );
}
