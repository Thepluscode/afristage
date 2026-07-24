'use client';

// Floating reaction hearts that drift up and fade — the ambient "people are
// feeling it" layer. Each heart is keyed so React animates it once; the parent
// removes it after the animation.
export default function HeartsOverlay({ hearts }: { hearts: { id: number; type: string }[] }) {
  if (hearts.length === 0) return null;
  return (
    <div className="hearts" aria-hidden="true">
      {hearts.map((h) => (
        <span className="heart" key={h.id} style={{ left: `${((h.id * 37) % 55) + 30}%` }}>
          {h.type === 'heart' ? '❤️' : '✨'}
        </span>
      ))}
    </div>
  );
}
