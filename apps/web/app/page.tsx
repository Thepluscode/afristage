import Link from 'next/link';

// The web front door. The landing marketing lives in apps/landing / /site; this is
// the app entry — one tap to the live stage, the promise the marketing makes.
export default function HomePage() {
  return (
    <main className="home">
      <small>AfriStage</small>
      <h1>
        Watch the stage,<br />
        <i>live</i>.
      </h1>
      <p>Every stage on the continent — free. No app, no card.</p>
      <Link className="cta" href="/watch">
        Watch live now
      </Link>
    </main>
  );
}
