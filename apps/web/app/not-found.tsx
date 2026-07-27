/** A dead room link is the common case here — say so plainly and offer the way back. */
export default function NotFound() {
  return (
    <main className="crash-panel">
      <h1>That page is not here</h1>
      <p>
        The stage may have ended, or the link may be out of date. Browse what is live right now
        instead.
      </p>
      <div className="crash-actions">
        <a href="/">Back to live</a>
      </div>
    </main>
  );
}
