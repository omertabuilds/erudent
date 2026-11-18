import type { EloPoint } from "@/lib/profile";

const W = 700;
const H = 180;
const PAD = 12; // keeps the line off the top and bottom edges

const mono = "font-mono text-[10px] tracking-[0.14em] text-[#6e6a62] uppercase";
const num = (n: number) => n.toLocaleString("en-US");
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Elo across the duels the backend returns, oldest to newest, one step per duel.
 * `next` draws a dashed line at the next rank's cutoff, in that rank's color.
 */
export default function EloChart({ points, next }: { points: EloPoint[]; next: { tier: number; name: string; elo: number } | null }) {
  const duels = points.length - 1;
  const values = points.map((p) => p.elo);
  const high = Math.max(...values);

  if (points.length < 2) {
    return (
      <section aria-labelledby="elo-title" className="rounded-(--radius-lg) border border-line p-5">
        <h2 id="elo-title" className={mono}>
          Elo
        </h2>
        <p className="mt-4 text-[14px] text-text-muted">The Elo line starts after the first rated duel.</p>
      </section>
    );
  }

  const lo = Math.min(...values, next?.elo ?? Infinity);
  const hi = Math.max(...values, next?.elo ?? -Infinity);
  const span = Math.max(hi - lo, 40); // a flat run still gets some height
  const mid = (hi + lo) / 2;
  const y = (elo: number) => PAD + (1 - (elo - (mid - span / 2)) / span) * (H - 2 * PAD);
  const x = (i: number) => (i / duels) * W;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.elo).toFixed(1)}`).join(" ");
  const first = values[0];
  const last = values[values.length - 1];

  return (
    <section aria-labelledby="elo-title" className="rounded-(--radius-lg) border border-line p-5">
      <div className={`flex items-baseline justify-between ${mono}`}>
        <h2 id="elo-title" className="font-normal">
          Elo · last {duels} rated {duels === 1 ? "duel" : "duels"}
        </h2>
        <p>
          High <span className="text-text">{num(high)}</span>
        </p>
      </div>
      <svg
        role="img"
        aria-label={`Elo over the last ${duels} rated ${duels === 1 ? "duel" : "duels"}, from ${num(first)} to ${num(last)}, high ${num(high)}${
          next ? `. ${next.name} starts at ${num(next.elo)}` : ""
        }`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-3.5 block h-[180px] w-full"
      >
        <g stroke="#16161a" strokeWidth="1" vectorEffect="non-scaling-stroke">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        {next && (
          <line
            x1="0"
            x2={W}
            y1={y(next.elo)}
            y2={y(next.elo)}
            stroke={`var(--rank-${next.tier})`}
            strokeWidth="1"
            strokeDasharray="3 5"
            opacity="0.7"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline points={line} fill="none" stroke="var(--text)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={`mt-2 flex justify-between gap-3 ${mono}`}>
        <span>{day.format(new Date(points[0].at))}</span>
        {next && (
          <span style={{ color: `var(--rank-${next.tier}-text)` }}>
            {next.name} {num(next.elo)}
          </span>
        )}
        <span>Now</span>
      </div>
    </section>
  );
}
