/**
 * The queue warmup: Zetamac-style arithmetic, made up in the browser. Nothing here touches the
 * database. Ranges are Zetamac's defaults:
 *
 *   addition        (2–100) + (2–100)
 *   subtraction     addition in reverse:        (a + b) − a = b
 *   multiplication  (2–12) × (2–100)
 *   division        multiplication in reverse:  (a × b) ÷ a = b
 *
 * So every answer is a whole number from 2 to 200 (or 2 to 1200 for products).
 */

export type Op = "+" | "−" | "×" | "÷";

export type Problem = {
  /** Left operand. */
  a: number;
  /** Right operand. */
  b: number;
  op: Op;
  answer: number;
};

export const OPS: readonly Op[] = ["+", "−", "×", "÷"];

/** Zetamac's default ranges, inclusive. */
export const RANGES = {
  add: { a: [2, 100], b: [2, 100] },
  mul: { a: [2, 12], b: [2, 100] },
} as const;

/** A number from 0 (inclusive) to 1 (exclusive), like Math.random. Tests pass a seeded one. */
export type Rand = () => number;

const int = (lo: number, hi: number, rand: Rand) => lo + Math.floor(rand() * (hi - lo + 1));

/** One problem, the four operations equally likely. */
export function makeProblem(rand: Rand = Math.random): Problem {
  const op = OPS[Math.min(OPS.length - 1, Math.floor(rand() * OPS.length))];
  if (op === "+" || op === "−") {
    const x = int(RANGES.add.a[0], RANGES.add.a[1], rand);
    const y = int(RANGES.add.b[0], RANGES.add.b[1], rand);
    return op === "+" ? { a: x, b: y, op, answer: x + y } : { a: x + y, b: x, op, answer: y };
  }
  const x = int(RANGES.mul.a[0], RANGES.mul.a[1], rand);
  const y = int(RANGES.mul.b[0], RANGES.mul.b[1], rand);
  return op === "×" ? { a: x, b: y, op, answer: x * y } : { a: x * y, b: x, op, answer: y };
}

/** The next problem, never the same one twice in a row. */
export function nextProblem(prev: Problem | null, rand: Rand = Math.random): Problem {
  for (let i = 0; i < 8; i++) {
    const p = makeProblem(rand);
    if (!prev || p.a !== prev.a || p.b !== prev.b || p.op !== prev.op) return p;
  }
  return makeProblem(rand);
}

/** Digits only: what the answer field keeps of whatever was typed or pasted. */
export const digits = (raw: string) => raw.replace(/\D/g, "").slice(0, 5);

/**
 * Where the typed value stands against the answer.
 * "solved" the moment it equals the answer; "partial" while it could still become it
 * (empty counts); "wrong" once a digit can't be right.
 */
export function check(value: string, answer: number): "solved" | "partial" | "wrong" {
  const want = String(answer);
  if (value === want) return "solved";
  return want.startsWith(value) ? "partial" : "wrong";
}

/** Spoken form for screen readers: "47 plus 38". */
export function spoken(p: Problem): string {
  const word = { "+": "plus", "−": "minus", "×": "times", "÷": "divided by" }[p.op];
  return `${p.a} ${word} ${p.b}`;
}

/** Queue clock: 0:07, 1:42, 12:03. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
