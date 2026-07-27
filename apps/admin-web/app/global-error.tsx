'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: catches crashes in the root layout itself, where
 * `error.tsx` cannot mount. It replaces the whole document, so it must render
 * its own <html>/<body> and cannot rely on the app's stylesheet having loaded.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Admin root layout error', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#07070a',
          color: '#fafafa',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: 24
        }}
      >
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>AfriStage Admin could not start</h1>
          <p style={{ margin: '0 0 18px', color: '#a1a1aa', lineHeight: 1.5, fontSize: 14 }}>
            The application shell failed to load. This is not a problem with your account or your
            data. Reload to try again.
          </p>
          {error.digest ? (
            <p style={{ margin: '0 0 18px', color: '#a1a1aa', fontSize: 13 }}>
              Reference: <code style={{ color: '#ffc857' }}>{error.digest}</code>
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              minHeight: 40,
              padding: '10px 18px',
              border: 0,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #ff8a1f, #ffb000)',
              color: '#160b02',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
