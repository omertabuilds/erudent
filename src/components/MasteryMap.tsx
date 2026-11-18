"use client";

import { useMemo, useState } from "react";
import {
  VIEW_H,
  VIEW_W,
  clearsLabel,
  defaultTopic,
  layoutMap,
  overallScore,
  topicStats,
  type MasteryRow,
  type TierLabel,
} from "@/lib/mastery";

const mono = "font-mono text-[11px] tracking-[0.12em] text-[#6e6a62]";
const num = (n: number) => n.toLocaleString("en-US");

const tierColor: Record<TierLabel["state"], string> = {
  cleared: "var(--text)",
  tried: "var(--text-muted)",
  untried: "color-mix(in oklab, var(--text-muted) 45%, var(--bg))",
};

/**
 * The mastery constellation: the core in the middle, the 11 topics on an oval, each topic's six
 * tiers fanned outward. Cluster size and brightness follow accuracy; untried tiers are one dim dot.
 * Click a topic to select it.
 */
export default function MasteryMap({ rows }: { rows: MasteryRow[] }) {
  const stats = useMemo(() => topicStats(rows), [rows]);
  const [selected, setSelected] = useState(() => defaultTopic(stats));
  const map = useMemo(() => layoutMap(stats, selected), [stats, selected]);

  const total = stats.reduce((s, t) => s + t.answers, 0);
  const sel = stats[selected];
  const empty = total === 0;

  return (
    <section aria-labelledby="mastery-title" className="mt-2 font-mono">
      <div className={`${mono} flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1`}>
        <h2 id="mastery-title" className="font-normal">
          MASTERY <span className="text-text">{overallScore(stats)}</span> · {num(total)} ANSWERS
        </h2>
        <p aria-live="polite">
          {sel.name.toUpperCase()} <span className="text-text">{sel.score}</span> · {num(sel.answers)} ANSWERS · CLEARS{" "}
          {clearsLabel(sel.clears)}
        </p>
      </div>

      {/* Below ~720px the labels would collide, so the map keeps its width and scrolls sideways. */}
      <div className="-mx-4 mt-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="relative w-full min-w-[720px]" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full text-text"
          >
            <defs>
              <radialGradient id="mastery-halo">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.5" />
                <stop offset="0.4" stopColor="currentColor" stopOpacity="0.12" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>
            {map.halos.map((h, i) => (
              <circle key={`h${i}`} cx={h.x} cy={h.y} r={h.r} fill="url(#mastery-halo)" opacity={h.o} />
            ))}
            <g fill="none" stroke="currentColor" strokeLinecap="round">
              {map.edges.map((e, i) => (
                <path key={`e${i}`} d={e.d} strokeWidth={e.w} opacity={e.o} />
              ))}
              {map.hollows.map((c, i) => (
                <circle key={`o${i}`} cx={c.x} cy={c.y} r={c.r} strokeWidth="0.6" opacity="0.3" />
              ))}
            </g>
            <g fill="currentColor">
              {map.pulses.map((p, i) => (
                <circle key={`p${i}`} cx={p.x} cy={p.y} r={p.r} opacity={p.o} />
              ))}
              {map.parts.map((p, i) => (
                <circle key={`d${i}`} cx={p.x} cy={p.y} r={p.r} opacity={p.o} />
              ))}
            </g>
          </svg>

          {map.tierLabels.map((l) => (
            <span
              key={l.text.slice(0, 3)}
              aria-hidden="true"
              className="pointer-events-none absolute -translate-x-1/2 text-[9px] tracking-[0.1em] whitespace-nowrap"
              style={{ left: `${l.left}%`, top: `${l.top}%`, color: tierColor[l.state] }}
            >
              {l.text}
            </span>
          ))}

          {map.topics.map((t) => (
            <button
              key={t.name}
              type="button"
              aria-pressed={t.selected}
              aria-label={`${t.name}, mastery ${t.score}`}
              onClick={() => setSelected(t.index)}
              className={`absolute -translate-x-1/2 cursor-pointer rounded-sm px-1 py-0.5 text-[10px] tracking-[0.14em] whitespace-nowrap uppercase focus-visible:outline-1 focus-visible:outline-focus ${
                t.above ? "-translate-y-full" : ""
              } ${t.selected ? "text-text" : "text-text-muted hover:text-text"}`}
              style={{ left: `${t.left}%`, top: `${t.top}%` }}
            >
              {t.name}
              {t.selected && !empty && <span className="ml-2 text-text-muted">{t.score}</span>}
            </button>
          ))}

          {empty && (
            <p className="pointer-events-none absolute top-1/2 left-1/2 mt-8 -translate-x-1/2 font-ui text-[13px] whitespace-nowrap text-text-muted">
              Answer questions to light this up.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
