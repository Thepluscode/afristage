// Dependency-free SVG sparkline. ponytail: no chart lib for a single trend line —
// a polyline over a normalized viewBox is all this needs.
export function Sparkline({ values, label, accent = 'var(--accent, #6ad)' }: { values: number[]; label: string; accent?: string }) {
  const w = 240;
  const h = 48;
  const max = Math.max(1, ...values); // avoid divide-by-zero on an all-zero series
  const total = values.reduce((a, b) => a + b, 0);
  const last = values.length ? values[values.length - 1] : 0;
  // Map each value to an (x, y) point; single-point series sits flat at the left.
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(' ');

  return (
    <div className="sparkline">
      <div className="sparkline-head">
        <span className="sparkline-label">{label}</span>
        <span className="sparkline-total">{total.toLocaleString()} total · {last.toLocaleString()} today</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label={`${label} trend`}>
        {values.length > 1 ? (
          <polyline points={points} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
      </svg>
    </div>
  );
}
