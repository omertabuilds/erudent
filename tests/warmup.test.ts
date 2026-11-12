import { describe, expect, test } from "vitest";
import { check, clock, digits, makeProblem, nextProblem, spoken, type Problem, type Rand } from "@/lib/warmup";

// The queue warmup's problem maker. Pure functions, no database.

/** Deterministic stand-in for Math.random (mulberry32). */
function seeded(seed: number): Rand {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Always returns the given values in turn. */
const fixed = (...vals: number[]): Rand => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

const between = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

const SAMPLE: Problem[] = (() => {
  const rand = seeded(42);
  return Array.from({ length: 20_000 }, () => makeProblem(rand));
})();

describe("makeProblem", () => {
  test("addition: (2–100) + (2–100)", () => {
    for (const p of SAMPLE.filter((p) => p.op === "+")) {
      expect(between(p.a, 2, 100) && between(p.b, 2, 100)).toBe(true);
      expect(p.answer).toBe(p.a + p.b);
    }
  });

  test("subtraction is addition reversed", () => {
    for (const p of SAMPLE.filter((p) => p.op === "−")) {
      expect(between(p.a, 4, 200)).toBe(true);
      expect(between(p.b, 2, 100)).toBe(true);
      expect(between(p.answer, 2, 100)).toBe(true);
      expect(p.a - p.b).toBe(p.answer);
    }
  });

  test("multiplication: (2–12) × (2–100)", () => {
    for (const p of SAMPLE.filter((p) => p.op === "×")) {
      expect(between(p.a, 2, 12) && between(p.b, 2, 100)).toBe(true);
      expect(p.answer).toBe(p.a * p.b);
    }
  });

  test("division is multiplication reversed, always whole", () => {
    for (const p of SAMPLE.filter((p) => p.op === "÷")) {
      expect(between(p.b, 2, 12)).toBe(true);
      expect(between(p.answer, 2, 100)).toBe(true);
      expect(p.a % p.b).toBe(0);
      expect(p.a / p.b).toBe(p.answer);
    }
  });

  test("all four operations come up about equally", () => {
    for (const op of ["+", "−", "×", "÷"] as const) {
      const share = SAMPLE.filter((p) => p.op === op).length / SAMPLE.length;
      expect(share).toBeGreaterThan(0.22);
      expect(share).toBeLessThan(0.28);
    }
  });

  test("reaches both ends of every range", () => {
    const adds = SAMPLE.filter((p) => p.op === "+");
    const muls = SAMPLE.filter((p) => p.op === "×");
    expect(Math.min(...adds.map((p) => p.a))).toBe(2);
    expect(Math.max(...adds.map((p) => p.b))).toBe(100);
    expect(Math.min(...muls.map((p) => p.a))).toBe(2);
    expect(Math.max(...muls.map((p) => p.a))).toBe(12);
    expect(Math.max(...muls.map((p) => p.b))).toBe(100);
  });

  test("a random value right under 1 stays in range", () => {
    const p = makeProblem(fixed(0.999999999));
    expect(p.op).toBe("÷");
    expect(p).toEqual({ a: 1200, b: 12, op: "÷", answer: 100 });
  });

  test("a random value of 0 gives the smallest addition", () => {
    expect(makeProblem(fixed(0))).toEqual({ a: 2, b: 2, op: "+", answer: 4 });
  });
});

describe("nextProblem", () => {
  test("never repeats the previous problem", () => {
    const rand = seeded(7);
    let prev = nextProblem(null, rand);
    for (let i = 0; i < 5_000; i++) {
      const p = nextProblem(prev, rand);
      expect(p.a === prev.a && p.b === prev.b && p.op === prev.op).toBe(false);
      prev = p;
    }
  });

  test("redraws when the first draw matches", () => {
    // op 0 (+), a = 2, b = 2 → same as prev; then op 0, a = 3, b = 2.
    const prev: Problem = { a: 2, b: 2, op: "+", answer: 4 };
    const p = nextProblem(prev, fixed(0, 0, 0, 0, 0.015, 0));
    expect(p).toEqual({ a: 3, b: 2, op: "+", answer: 5 });
  });
});

describe("check", () => {
  test("solved the moment the value equals the answer", () => {
    expect(check("85", 85)).toBe("solved");
    expect(check("1200", 1200)).toBe("solved");
  });

  test("partial while it could still become the answer", () => {
    expect(check("", 85)).toBe("partial");
    expect(check("8", 85)).toBe("partial");
    expect(check("12", 1200)).toBe("partial");
  });

  test("wrong once a digit can't be right", () => {
    expect(check("9", 85)).toBe("wrong");
    expect(check("86", 85)).toBe("wrong");
    expect(check("850", 85)).toBe("wrong");
    expect(check("085", 85)).toBe("wrong");
  });
});

describe("digits", () => {
  test("keeps digits only, at most five", () => {
    expect(digits("12a3")).toBe("123");
    expect(digits(" -4.5 ")).toBe("45");
    expect(digits("1234567")).toBe("12345");
    expect(digits("")).toBe("");
  });
});

describe("spoken and clock", () => {
  test("reads the problem in words", () => {
    expect(spoken({ a: 47, b: 38, op: "+", answer: 85 })).toBe("47 plus 38");
    expect(spoken({ a: 84, b: 7, op: "÷", answer: 12 })).toBe("84 divided by 7");
  });

  test("formats the queue clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(7.9)).toBe("0:07");
    expect(clock(102)).toBe("1:42");
    expect(clock(723)).toBe("12:03");
    expect(clock(-3)).toBe("0:00");
  });
});
