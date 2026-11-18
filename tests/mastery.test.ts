import { describe, expect, test } from "vitest";
import {
  TOPICS,
  clearedTier,
  clearsLabel,
  defaultTopic,
  elementCount,
  layoutMap,
  masteryScore,
  overallScore,
  topicStats,
  type MasteryRow,
} from "@/lib/mastery";

const tiers = (...pairs: [number, number][]) => pairs.map(([correct, attempted]) => ({ correct, attempted }));

describe("scores", () => {
  test("mastery = 100 × tier-weighted accuracy × min(1, weighted attempts / 75)", () => {
    expect(masteryScore(tiers())).toBe(0);
    // Tier 1: 3/4, tier 3: 1/2 → c = 3 + 3 = 6, a = 4 + 6 = 10 → 100 × 0.6 × 10/75 = 8
    expect(masteryScore(tiers([3, 4], [0, 0], [1, 2]))).toBe(8);
    // Full confidence: 75 tier-1 answers all right → 100
    expect(masteryScore(tiers([75, 75]))).toBe(100);
    // Past full confidence, accuracy alone: tier 6 counts 6×. 40 right of 40 at tier 1, 0 of 10 at tier 6.
    expect(masteryScore(tiers([40, 40], [0, 0], [0, 0], [0, 0], [0, 0], [0, 10]))).toBe(40);
  });

  test("clears = highest tier at ≥60%", () => {
    expect(clearedTier(tiers([3, 5], [1, 5], [2, 2]))).toBe(3);
    expect(clearedTier(tiers([2, 5]))).toBe(0);
    expect(clearsLabel(3)).toBe("SCHOLAR");
    expect(clearsLabel(0)).toBe("—");
  });

  test("rows map to topics ignoring case; unknown topics are left out", () => {
    const rows: MasteryRow[] = [
      { topic: "number theory", tier: 2, attempted: 4, correct: 3 },
      { topic: "Number Theory", tier: 2, attempted: 1, correct: 1 },
      { topic: "Topology", tier: 1, attempted: 9, correct: 9 },
    ];
    const stats = topicStats(rows);
    expect(stats.map((s) => s.name)).toEqual([...TOPICS]);
    const nt = stats[1];
    expect(nt.tiers[1]).toEqual({ attempted: 5, correct: 4 });
    expect(nt.answers).toBe(5);
    expect(nt.clears).toBe(2);
    expect(stats.reduce((s, t) => s + t.answers, 0)).toBe(5);
    expect(defaultTopic(stats)).toBe(1);
    expect(overallScore(stats)).toBe(Math.round(nt.score / TOPICS.length));
  });
});

describe("layout", () => {
  const heavy: MasteryRow[] = TOPICS.flatMap((topic) =>
    [1, 2, 3, 4, 5, 6].map((tier) => ({ topic, tier, attempted: 10_000, correct: 10_000 })),
  );

  test("deterministic: same data, same particles", () => {
    const rows: MasteryRow[] = [{ topic: "Algebra", tier: 1, attempted: 12, correct: 9 }];
    expect(layoutMap(topicStats(rows), 0)).toEqual(layoutMap(topicStats(rows), 0));
  });

  test("a topic's particles don't move when another topic changes or the selection moves (beyond brightness)", () => {
    const a = layoutMap(topicStats([{ topic: "Algebra", tier: 2, attempted: 8, correct: 6 }]), 0);
    const b = layoutMap(
      topicStats([
        { topic: "Algebra", tier: 2, attempted: 8, correct: 6 },
        { topic: "Geometry", tier: 1, attempted: 3, correct: 3 },
      ]),
      5,
    );
    // Algebra sits at the top of the oval (600, 95); keep only particles around it.
    const pos = (l: typeof a) =>
      l.parts.filter((p) => Math.hypot(Number(p.x) - 600, Number(p.y) - 95) < 110).map((p) => `${p.x},${p.y},${p.r}`);
    expect(pos(a).length).toBeGreaterThan(20);
    expect(pos(b)).toEqual(pos(a));
  });

  test("stays under 2,000 SVG elements with maxed-out data, whichever topic is selected", () => {
    const stats = topicStats(heavy);
    for (let i = 0; i < TOPICS.length; i++) expect(elementCount(layoutMap(stats, i))).toBeLessThan(2000);
  });

  test("untried tiers are a single dot; the selected topic gets six tier labels", () => {
    const l = layoutMap(topicStats([{ topic: "Calculus", tier: 1, attempted: 2, correct: 2 }]), 4);
    expect(l.tierLabels.map((t) => t.text)).toEqual(["NOV 2/2", "APP —", "SCH —", "SAV —", "SAG —", "ERU —"]);
    expect(l.tierLabels.map((t) => t.state)).toEqual(["cleared", "untried", "untried", "untried", "untried", "untried"]);
    expect(l.topics.filter((t) => t.selected).map((t) => t.name)).toEqual(["Calculus"]);
  });

  test("new player: outline only, no particles but the core", () => {
    const l = layoutMap(topicStats([]), 0);
    expect(l.parts).toHaveLength(1);
    expect(l.pulses).toHaveLength(0);
    expect(l.hollows).toHaveLength(TOPICS.length * 7);
  });
});
