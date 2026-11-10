"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Caveat } from "next/font/google";
import { FAR, K, MID, NEAR, SUMMIT_Y, ridge } from "@/components/landing/ridges";

/*
 * "The Climb": a mountain behind, one laptop showing a live duel, tilted stickers in front.
 *
 * Everything is drawn in device units: --u = 1/640 of the device width (520px on md+, 90vw below) (container query
 * units on the wrapper), so the laptop, the summit and the altitude lines stay locked
 * together from 375px to 1600px+.
 *
 * Nothing here can cover the headline or form: the stage has a fixed height and every sticker
 * sits inside it. On md+ the text is below the stage and stickers only move up, away from it;
 * below md the text is above the stage and stickers don't move.
 *
 * Parallax: far and mid lag behind the page (far most), near and the stickers run slightly
 * ahead. The near ridge is paper-colored and extends below the stage, so moving layers never
 * open a seam. Transform only; off under prefers-reduced-motion.
 */

const hand = Caveat({ subsets: ["latin"], weight: ["500"], display: "swap" });

/** n device units → CSS length. */
const u = (n: number) => `calc(var(--u) * ${n})`;
/** Never smaller than `px`, otherwise n device units. Keeps stickers readable on phones. */
const uMin = (px: number, n: number) => `max(${px}px, ${u(n)})`;

const DEVICE_TOP = 96; // u: room above the device for the summit, flag and top two altitudes
const STAGE_H = DEVICE_TOP + 430 + 36; // u: device, then room for stickers hanging off its bottom edge
const DEVICE_H = 430; // u: lid 414 + base 16

// Positive = lags the page (moves down on screen), negative = runs ahead (moves up).
// Stickers ride with `near`, except below md, where the scene sits under the form and
// stickers moving up could reach it; there they stay put.
const SPEED = { far: 0.22, mid: 0.1, near: -0.06 } as const;

// ── Mountain ────────────────────────────────────────────────────────

// Bottom to top. The gaps shrink toward the summit: the climb gets steeper.
// Erudite and Sage sit above the device; the rest show beside it.
const ALTITUDES = (
  [
    ["Novice", 380],
    ["Apprentice", 290],
    ["Scholar", 210],
    ["Savant", 140],
    ["Sage", 86],
    ["Erudite", 56],
  ] as const
).map(([name, y]) => {
  const hw = K * (y - SUMMIT_Y) * 0.96; // inside the silhouette
  const above = y < DEVICE_TOP;
  // Above the device a line hugs the peak and is labelled at its end. Beside the device it
  // spans the mountain, and its label sits in a column just left of the device.
  return { name, y, above, half: above ? hw : Math.max(hw, 360), lx: above ? -hw - 8 : -368, ly: above ? y + 4 : y - 5 };
});

const svgBox: CSSProperties = { position: "absolute", top: 0, left: `calc(50% - ${u(1200)})`, width: u(2400), height: u(STAGE_H), overflow: "visible" };
const VIEW = `-1200 0 2400 ${STAGE_H}`;

function Mountain({ refs }: { refs: React.RefObject<Record<string, SVGSVGElement | HTMLDivElement | null>> }) {
  const set = (k: string) => (el: SVGSVGElement | null) => {
    refs.current[k] = el;
  };
  return (
    // Full viewport width, clipped to the stage height.
    <div className="absolute inset-y-0 left-[calc(50%-50vw)] w-screen overflow-hidden">
      <svg ref={set("far")} viewBox={VIEW} style={svgBox} preserveAspectRatio="none">
        <defs>
          <linearGradient id="climb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.3" style={{ stopColor: "var(--paper)" }} />
            <stop offset="0.48" style={{ stopColor: "var(--sky)" }} />
          </linearGradient>
        </defs>
        <rect x="-3000" y="-600" width="6000" height="1800" fill="url(#climb-sky)" />
        <path d={ridge(FAR)} style={{ fill: "var(--ridge-far)" }} />
      </svg>

      <svg ref={set("mid")} viewBox={VIEW} style={svgBox} preserveAspectRatio="none">
        <path d={ridge(MID)} style={{ fill: "var(--ridge-mid)" }} />
        {ALTITUDES.map(({ name, y, above, half, lx, ly }) => {
          return (
            <g key={name}>
              <line x1={-half} x2={half} y1={y} y2={y} strokeWidth="1" strokeDasharray="3 5" style={{ stroke: "var(--ink-muted)" }} opacity="0.35" />
              <text
                x={lx}
                y={ly}
                textAnchor="end"
                fontSize="12"
                fontWeight="600"
                letterSpacing="0.04em"
                opacity="0.75"
                style={{ fill: "var(--ink-muted)" }}
                // On phones the side labels would run off-screen; keep the two above the device.
                className={above ? undefined : "max-md:hidden"}
              >
                {name}
              </text>
            </g>
          );
        })}
        {/* Summit flag with the ∃ mark */}
        <line x1="0" x2="0" y1={SUMMIT_Y} y2={SUMMIT_Y - 30} strokeWidth="1.5" style={{ stroke: "var(--ink)" }} />
        <rect x="0" y={SUMMIT_Y - 30} width="22" height="15" rx="2" style={{ fill: "var(--ink)" }} />
        <text x="11" y={SUMMIT_Y - 18.5} textAnchor="middle" fontSize="12" fontWeight="800" style={{ fill: "var(--paper)" }}>
          ∃
        </text>
      </svg>

      <svg ref={set("near")} viewBox={VIEW} style={svgBox} preserveAspectRatio="none">
        <path d={ridge(NEAR)} strokeWidth="1.5" strokeLinejoin="round" style={{ fill: "var(--paper)", stroke: "var(--hairline)" }} />
      </svg>
    </div>
  );
}

// ── Device: a duel mid-match, in MatchRoom's layout ─────────────────

function Tab({ slot, pts, sub, state }: { slot: string; pts: string; sub: ReactNode; state: "done" | "open" | "locked" }) {
  return (
    <div
      className={`flex flex-col border ${state === "open" ? "border-ink" : "border-hairline"} ${state === "locked" ? "opacity-50" : ""}`}
      style={{ borderRadius: u(10), padding: `${u(8)} ${u(12)}`, borderWidth: state === "open" ? u(1.5) : 1 }}
    >
      <span className="font-semibold tabular-nums" style={{ fontSize: u(13) }}>
        {slot} · {pts}
      </span>
      <span className="text-ink-muted" style={{ fontSize: u(11), marginTop: u(2) }}>
        {sub}
      </span>
    </div>
  );
}

function Device() {
  return (
    <div className="absolute inset-x-0" style={{ top: u(DEVICE_TOP), height: u(DEVICE_H) }}>
      {/* Lid */}
      <div className="bg-ink" style={{ borderRadius: u(22), padding: `${u(14)} ${u(12)}` }}>
        <div className="mx-auto rounded-full bg-on-ink opacity-40" style={{ width: u(5), height: u(5), marginTop: u(-9), marginBottom: u(4) }} />
        <div className="overflow-hidden bg-paper text-ink" style={{ borderRadius: u(10), height: u(380), padding: `${u(18)} ${u(22)}` }}>
          <header className="flex items-center justify-between border-b border-hairline" style={{ paddingBottom: u(12) }}>
            <div className="flex flex-col">
              <span className="font-semibold" style={{ fontSize: u(13) }}>@you</span>
              <span className="text-ink-muted" style={{ fontSize: u(11) }}>Scholar</span>
            </div>
            <span className="font-extrabold tracking-[-0.03em] tabular-nums" style={{ fontSize: u(46), lineHeight: 1 }}>
              2:41
            </span>
            <div className="flex flex-col items-end">
              <span className="font-semibold" style={{ fontSize: u(13) }}>@maya</span>
              <span className="text-ink-muted" style={{ fontSize: u(11) }}>solved A</span>
            </div>
          </header>

          <nav className="grid grid-cols-3" style={{ gap: u(8), marginTop: u(14) }}>
            <Tab slot="A" pts="1pt" state="done" sub={<>Correct <span className="text-pencil">✓</span></>} />
            <Tab slot="B" pts="2pts" state="open" sub="Combinatorics" />
            <Tab slot="C" pts="3pts" state="locked" sub="Locked" />
          </nav>

          <section className="flex flex-col border border-hairline" style={{ borderRadius: u(12), padding: u(18), marginTop: u(14), gap: u(14) }}>
            <p className="font-semibold" style={{ fontSize: u(20), lineHeight: 1.3 }}>
              How many ways can the letters of LEVEL be arranged?
            </p>
            <div className="flex" style={{ gap: u(8) }}>
              <div
                className="flex flex-1 items-center border border-rule bg-sunken text-ink-muted"
                style={{ height: u(40), borderRadius: u(12), padding: `0 ${u(12)}`, fontSize: u(13) }}
              >
                Integer or fraction, e.g. 12 or 3/4
              </div>
              <div
                className="flex items-center bg-ink font-bold text-on-ink"
                style={{ height: u(40), borderRadius: u(12), padding: `0 ${u(18)}`, fontSize: u(13) }}
              >
                Submit
              </div>
            </div>
            <p className="text-ink-muted" style={{ fontSize: u(11) }}>One try per question. All or nothing.</p>
          </section>
        </div>
      </div>
      {/* Base */}
      <div
        className="relative bg-ink"
        style={{ height: u(16), marginLeft: u(-30), marginRight: u(-30), borderRadius: `${u(2)} ${u(2)} ${u(14)} ${u(14)}`, marginTop: u(-1) }}
      >
        <div className="absolute left-1/2 top-0 -translate-x-1/2 bg-on-ink opacity-25" style={{ width: u(90), height: u(5), borderRadius: `0 0 ${u(5)} ${u(5)}` }} />
      </div>
    </div>
  );
}

// ── Stickers ────────────────────────────────────────────────────────

// Die-cut edge: a thick paper-colored margin, outlined.
const cut: CSSProperties = {
  borderStyle: "solid",
  borderColor: "var(--sticker-edge)",
  borderWidth: uMin(4, 6),
  outline: "1.5px solid var(--rule)",
  boxShadow: "var(--shadow-float)",
};

function Bubble({ children, tail }: { children: ReactNode; tail: "left" | "right" }) {
  const r = uMin(14, 20);
  return (
    <div
      className="bg-surface font-semibold whitespace-nowrap"
      style={{
        ...cut,
        fontSize: uMin(13, 17),
        padding: `${uMin(7, 10)} ${uMin(12, 16)}`,
        borderRadius: tail === "left" ? `${r} ${r} ${r} 4px` : `${r} ${r} 4px ${r}`,
      }}
    >
      {children}
    </div>
  );
}

function GraphScrap() {
  return (
    <div className="relative overflow-hidden bg-surface" style={{ ...cut, borderRadius: uMin(8, 10), width: uMin(120, 168), padding: `${uMin(6, 10)} ${uMin(10, 14)}` }}>
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <pattern id="climb-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" strokeWidth="1" style={{ stroke: "var(--hairline)" }} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#climb-grid)" />
      </svg>
      <div className={`${hand.className} relative`} style={{ fontSize: uMin(17, 22), lineHeight: 1.15 }}>
        <div>5x − 3 = 2x + 18</div>
        <div>3x = 21</div>
        <div>
          x = 7 <span className="text-pencil">✓</span>
        </div>
      </div>
    </div>
  );
}

type Sticker = {
  r: number; // degrees
  lg?: [x: string, y: string]; // position on lg+, as % of the device box
  sm?: [x: string, y: string]; // position below lg
  el: ReactNode;
};

// Order = drop-in order.
const STICKERS: Sticker[] = [
  {
    r: 6,
    lg: ["86%", "-7%"],
    sm: ["70%", "-15%"],
    el: (
      <div className="bg-surface font-extrabold whitespace-nowrap text-pencil tabular-nums" style={{ ...cut, borderRadius: 999, fontSize: uMin(15, 22), padding: `${uMin(5, 8)} ${uMin(12, 18)}` }}>
        +18 Elo
      </div>
    ),
  },
  {
    r: -7,
    lg: ["-26%", "14%"],
    sm: ["-3%", "-17%"],
    el: (
      <div className="bg-ink font-extrabold tracking-[0.08em] text-on-ink" style={{ ...cut, borderRadius: uMin(8, 10), fontSize: uMin(14, 24), padding: `${uMin(6, 10)} ${uMin(10, 18)}` }}>
        SCHOLAR
      </div>
    ),
  },
  { r: 4, lg: ["85%", "38%"], sm: ["50%", "80%"], el: <Bubble tail="left">gg. 6–3. rematch?</Bubble> },
  { r: -4, lg: ["-19%", "68%"], el: <Bubble tail="right">climbed to Sage in 2 weeks</Bubble> },
  { r: -6, lg: ["78%", "72%"], el: <GraphScrap /> },
  {
    r: 8,
    lg: ["-5%", "-12%"],
    sm: ["-2%", "72%"],
    el: (
      <div className="bg-ink" style={{ ...cut, borderRadius: uMin(6, 8), width: uMin(40, 64), height: uMin(40, 64) }} />
    ),
  },
  {
    r: 3,
    lg: ["6%", "91%"],
    el: (
      <div className="flex items-center bg-surface font-semibold whitespace-nowrap tabular-nums" style={{ ...cut, borderRadius: 999, fontSize: uMin(13, 15), gap: u(10), padding: `${uMin(5, 7)} ${uMin(12, 16)} ${uMin(5, 7)} ${uMin(8, 10)}` }}>
        <span className="rounded-full border border-rule bg-paper" style={{ width: uMin(8, 10), height: uMin(8, 10) }} />3 problems · 5 min
      </div>
    ),
  },
];

function Stickers({ wrapRef }: { wrapRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div ref={wrapRef} className="absolute inset-x-0" style={{ top: u(DEVICE_TOP), height: u(DEVICE_H) }}>
      {STICKERS.map((s, i) => (
        <div
          key={i}
          className={`absolute left-(--sx) top-(--sy) lg:left-(--lx) lg:top-(--ly) ${s.sm ? "" : "max-lg:hidden"} ${s.lg ? "" : "lg:hidden"}`}
          style={{ "--sx": s.sm?.[0], "--sy": s.sm?.[1], "--lx": s.lg?.[0], "--ly": s.lg?.[1] } as CSSProperties}
        >
          <div className="sticker" style={{ "--r": `${s.r}deg`, "--i": i } as CSSProperties}>
            {s.el}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stage ───────────────────────────────────────────────────────────

export default function Climb() {
  const layers = useRef<Record<string, SVGSVGElement | HTMLDivElement | null>>({});

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia("(min-width: 768px)");
    let raf = 0;
    let lastY = -1;
    const apply = () => {
      raf = 0;
      // Past ~1.5 screens the stage is gone; stop writing.
      const y = still.matches ? 0 : Math.min(window.scrollY, window.innerHeight * 1.5);
      if (y === lastY) return;
      lastY = y;
      const move = (k: string, speed: number) => {
        const el = layers.current[k];
        if (el) el.style.transform = y ? `translate3d(0, ${(y * speed).toFixed(1)}px, 0)` : "";
      };
      move("far", SPEED.far);
      move("mid", SPEED.mid);
      move("near", SPEED.near);
      move("stickers", wide.matches ? SPEED.near : 0);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    still.addEventListener("change", schedule);
    wide.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      still.removeEventListener("change", schedule);
      wide.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div aria-hidden="true" className="mx-auto w-[90vw] select-none [container-type:inline-size] md:w-[520px]">
      <div className="relative [--u:calc(100cqw/640)]" style={{ height: u(STAGE_H) }}>
        <Mountain refs={layers} />
        <Device />
        <Stickers
          wrapRef={(el) => {
            layers.current.stickers = el;
          }}
        />
      </div>
    </div>
  );
}
