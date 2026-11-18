import { TIER_NAMES } from "@/lib/erudent";

/** One get_mastery row: a player's answers to questions of one topic and tier (1–6). */
export type MasteryRow = { topic: string; tier: number; attempted: number; correct: number };

/** The Notion Question Bank topics, in map order (clockwise from the top). */
export const TOPICS = [
  "Algebra",
  "Number Theory",
  "Combinatorics",
  "Probability & EV",
  "Calculus",
  "Sequences",
  "System of Equations",
  "Geometry",
  "Ratios",
  "Arithmetic",
  "Mental Math",
] as const;

/** Prerequisite links drawn between topics. */
export const LINKS: [string, string][] = [
  ["Arithmetic", "Mental Math"],
  ["Arithmetic", "Ratios"],
  ["Ratios", "Probability & EV"],
  ["Combinatorics", "Probability & EV"],
  ["Algebra", "System of Equations"],
  ["Algebra", "Sequences"],
  ["Algebra", "Calculus"],
  ["Number Theory", "Combinatorics"],
  ["Geometry", "Calculus"],
];

export const TIER_ABBR = ["NOV", "APP", "SCH", "SAV", "SAG", "ERU"] as const;

/** Weighted attempts (tier t counts t×) needed for full confidence. */
export const FULL_CONFIDENCE = 75;
/** A tier counts as cleared at this accuracy. */
export const CLEAR_AT = 0.6;

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export type TierStat = { attempted: number; correct: number };
export type TopicStat = {
  name: string;
  tiers: TierStat[]; // index 0 = tier 1
  answers: number;
  score: number; // 0–100
  clears: number; // highest tier (1–6) at ≥60%, 0 if none
};

/** 100 × tier-weighted accuracy × min(1, weighted attempts / 75). */
export function masteryScore(tiers: TierStat[]): number {
  let c = 0;
  let a = 0;
  tiers.forEach((r, i) => {
    c += r.correct * (i + 1);
    a += r.attempted * (i + 1);
  });
  return a ? Math.round(100 * (c / a) * Math.min(1, a / FULL_CONFIDENCE)) : 0;
}

/** Highest tier (1–6) answered at ≥60%, or 0. */
export function clearedTier(tiers: TierStat[]): number {
  let best = 0;
  tiers.forEach((r, i) => {
    if (r.attempted && r.correct / r.attempted >= CLEAR_AT) best = i + 1;
  });
  return best;
}

/** Rows → one stat per map topic, in TOPICS order. Topics not on the map are left out. */
export function topicStats(rows: MasteryRow[]): TopicStat[] {
  const byKey = new Map<string, TierStat[]>(TOPICS.map((t) => [key(t), Array.from({ length: 6 }, () => ({ attempted: 0, correct: 0 }))]));
  for (const r of rows) {
    const tiers = byKey.get(key(r.topic));
    if (!tiers || r.tier < 1 || r.tier > 6) continue;
    tiers[r.tier - 1].attempted += r.attempted;
    tiers[r.tier - 1].correct += r.correct;
  }
  return TOPICS.map((name) => {
    const tiers = byKey.get(key(name))!;
    return {
      name,
      tiers,
      answers: tiers.reduce((s, r) => s + r.attempted, 0),
      score: masteryScore(tiers),
      clears: clearedTier(tiers),
    };
  });
}

/** Overall mastery: the mean of every map topic's score (untried topics count as 0). */
export const overallScore = (stats: TopicStat[]) => Math.round(stats.reduce((s, t) => s + t.score, 0) / stats.length);

/** The topic to show first: the one with the most answers (the first topic for a new player). */
export const defaultTopic = (stats: TopicStat[]) =>
  stats.reduce((best, t, i) => (t.answers > stats[best].answers ? i : best), 0);

export const clearsLabel = (tier: number) => (tier ? TIER_NAMES[tier - 1].toUpperCase() : "—");

// ---------------------------------------------------------------------------
// Layout: the constellation, in a 1200 × 560 viewBox.
// ---------------------------------------------------------------------------

export const VIEW_W = 1200;
export const VIEW_H = 560;
const CX = 600;
const CY = 285;
const RX = 400; // topic oval
const RY = 190;
const TIER_RX = 62; // tier fan around each topic
const TIER_RY = 44;

export type Dot = { x: string; y: string; r: string; o: string };
export type Edge = { d: string; w: number; o: string };
export type Label = { left: number; top: number; above?: boolean }; // percent of the box
export type TopicNode = Label & { index: number; name: string; score: number; selected: boolean };
export type TierLabel = Label & { text: string; state: "cleared" | "tried" | "untried" };
export type Hollow = { x: string; y: string; r: string };

export type MapLayout = {
  halos: Dot[];
  edges: Edge[];
  pulses: Dot[];
  parts: Dot[];
  hollows: Hollow[]; // empty state: outline rings where clusters will be
  topics: TopicNode[];
  tierLabels: TierLabel[];
};

const f = (n: number) => n.toFixed(1);

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lays out the map. Every cluster draws from its own seed (topic, tier), so particles stay put
 * across renders and when another topic's numbers change. Element count is bounded:
 * at most ~1,700 SVG elements whatever the data (see tests).
 */
export function layoutMap(stats: TopicStat[], selected: number): MapLayout {
  const empty = stats.every((t) => t.answers === 0);
  const out: MapLayout = { halos: [], edges: [], pulses: [], parts: [], hollows: [], topics: [], tierLabels: [] };
  const hubs = new Map<string, { x: number; y: number; i: number }>();

  const cluster = (seed: number, cx: number, cy: number, m: number, n: number, sig: number, bright: number) => {
    const rnd = rng(seed);
    const gauss = () => {
      let u = 0;
      while (u === 0) u = rnd();
      const v = rnd();
      return Math.max(-2.2, Math.min(2.2, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
    };
    out.halos.push({ x: f(cx), y: f(cy), r: f(sig * 3.6), o: f((0.08 + m / 260) * bright) });
    for (let k = 0; k < n; k++) {
      const g = gauss();
      const h = gauss();
      const d = Math.sqrt(g * g + h * h);
      const core = d < 1;
      out.parts.push({
        x: f(cx + g * sig),
        y: f(cy + h * sig),
        r: f(0.4 + rnd() * (core ? 1.0 : 0.55)),
        o: f((core ? 0.55 + rnd() * 0.45 : 0.2 + rnd() * 0.35) * bright),
      });
    }
  };

  const edge = (x1: number, y1: number, x2: number, y2: number, pull: number, hot: boolean, n: number, base: number) => {
    const mx0 = (x1 + x2) / 2;
    const my0 = (y1 + y2) / 2;
    const mx = mx0 + (CX - mx0) * pull;
    const my = my0 + (CY - my0) * pull;
    out.edges.push({ d: `M${f(x1)} ${f(y1)} Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`, w: hot ? 0.8 : 0.5, o: f(hot ? 0.5 : base) });
    if (!hot) return;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.pulses.push({
        x: f((1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2),
        y: f((1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2),
        r: "1.1",
        o: "0.85",
      });
    }
  };

  const N = stats.length;
  stats.forEach((topic, i) => {
    const ang = -Math.PI / 2 + i * ((Math.PI * 2) / N);
    const hx = CX + Math.cos(ang) * RX;
    const hy = CY + Math.sin(ang) * RY;
    hubs.set(topic.name, { x: hx, y: hy, i });
    const isSel = i === selected;
    const br = isSel ? 1 : 0.5;

    if (empty) {
      out.edges.push({ d: `M${f(CX)} ${f(CY)} L${f(hx)} ${f(hy)}`, w: 0.5, o: f(isSel ? 0.14 : 0.07) });
      out.hollows.push({ x: f(hx), y: f(hy), r: "6" });
    } else {
      edge(CX, CY, hx, hy, 0, isSel, 5, 0.08);
      const m = topic.score;
      cluster(1000 + i, hx, hy, m, Math.round(10 + m * 0.4), 5 + m * 0.05, br);
    }

    topic.tiers.forEach((r, t) => {
      const a = ang + (t - 2.5) * 0.24;
      const sx = hx + Math.cos(a) * TIER_RX;
      const sy = hy + Math.sin(a) * TIER_RY;
      const acc = r.attempted ? r.correct / r.attempted : 0;
      if (empty) {
        out.edges.push({ d: `M${f(hx)} ${f(hy)} L${f(sx)} ${f(sy)}`, w: 0.4, o: "0.05" });
        out.hollows.push({ x: f(sx), y: f(sy), r: "2.5" });
      } else if (r.attempted === 0) {
        out.parts.push({ x: f(sx), y: f(sy), r: "1.0", o: f(0.25 * br) });
        out.edges.push({ d: `M${f(hx)} ${f(hy)} L${f(sx)} ${f(sy)}`, w: 0.4, o: "0.05" });
      } else {
        edge(hx, hy, sx, sy, 0, isSel, 2, 0.12);
        // Size by accuracy; a handful of answers can't fill a cluster on its own.
        const filled = acc * Math.min(1, r.attempted / 10);
        cluster(i * 16 + t + 1, sx, sy, acc * 100, Math.round(3 + 11 * filled), 1.8 + acc * 2.6, br);
      }
      if (isSel) {
        out.tierLabels.push({
          text: `${TIER_ABBR[t]} ${r.attempted ? `${r.correct}/${r.attempted}` : "—"}`,
          left: (sx / VIEW_W) * 100,
          top: ((sy + 9) / VIEW_H) * 100,
          state: r.attempted === 0 ? "untried" : acc >= CLEAR_AT ? "cleared" : "tried",
        });
      }
    });

    const above = hy < CY;
    out.topics.push({
      index: i,
      name: topic.name,
      score: topic.score,
      selected: isSel,
      left: (hx / VIEW_W) * 100,
      top: ((above ? hy - 54 : hy + 50) / VIEW_H) * 100,
      above,
    });
  });

  // The core point.
  out.halos.push({ x: f(CX), y: f(CY), r: "22", o: empty ? "0.1" : "0.25" });
  out.parts.push({ x: f(CX), y: f(CY), r: "2.4", o: empty ? "0.5" : "1" });

  for (const [from, to] of LINKS) {
    const a = hubs.get(from);
    const b = hubs.get(to);
    if (!a || !b) continue;
    const hot = !empty && (a.i === selected || b.i === selected);
    edge(a.x, a.y, b.x, b.y, 0.4, hot, 8, empty ? 0.05 : 0.06);
  }
  return out;
}

/** SVG elements the layout draws (for the element budget). */
export const elementCount = (m: MapLayout) =>
  m.halos.length + m.edges.length + m.pulses.length + m.parts.length + m.hollows.length;
