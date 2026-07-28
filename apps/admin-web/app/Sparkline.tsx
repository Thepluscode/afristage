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

/// Decorative area micro-chart that sits inside a KPI card. No axes, no labels —
/// the card's value and delta carry the meaning, this only shows the shape.
export function MiniSparkline({ values, accent }: { values: number[]; accent: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 34;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - (v / max) * (h - 3) - 1.5] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // ponytail: gradient id is derived from the accent, so two cards with the same
  // accent share one def — collisions are harmless, they render identically.
  const gid = `spark-${accent.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <svg className="metric-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={accent} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
