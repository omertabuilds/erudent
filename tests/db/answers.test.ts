import { expect, test } from "vitest";
import { normalizeAnswer } from "../../src/lib/answers";
import { createDb } from "./harness";

const cases = ["6/8", " -3 / -4 ", "007", "0.5", "4/2", "3/0", "-0", "5/-10", "abc", "−12", "+9", "1/1", "0/5", "12/18", "1e3", ""];

test("importer and database agree on every answer format", async () => {
  const db = await createDb();
  for (const c of cases) {
    const r = await db.query<{ v: string | null }>(`select normalize_answer($1) v`, [c]);
    expect(normalizeAnswer(c), JSON.stringify(c)).toBe(r.rows[0].v);
  }
});
