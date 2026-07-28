import Link from 'next/link';

/** A mistyped or stale admin URL should explain itself, not 404 into nothing. */
export default function NotFound() {
  return (
    <div className="crash-panel">
      <h2>That admin page does not exist</h2>
      <p>
        The link may be out of date, or the section may have moved. Use the navigation on the left,
        or head back to the operations overview.
      </p>
      <div className="actions">
        <Link className="button" href="/">
          Back to Mission Control
        </Link>
      </div>
    </div>
  );
}
