import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, asUser, createDb, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

// get_mastery: per (topic, tier) attempted/correct across finished rated duels and practice.

type Row = { topic: string; tier: number; attempted: number; correct: number };

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db, 5, "ranked");
  await seedQuestions(db, 5, "practice");
});

const mastery = (caller: string | null, user?: string) =>
  asUser<Row>(db, caller, user === undefined ? `select * from public.get_mastery()` : `select * from public.get_mastery($1)`, user === undefined ? [] : [user]);

/** A question id by pool, tier and topic, retopicked so tests can spread answers over topics. */
async function question(pool: "ranked" | "practice", tier: number, n: number, topic = "Algebra") {
  const r = await db.query<{ id: string }>(
    `update questions set topic = $4 where id = (
       select id from questions where pool = $1 and tier = $2 order by prompt offset $3 limit 1)
     returning id`,
    [pool, tier, n, topic],
  );
  return r.rows[0].id;
}

/** A match written directly (admin), with `uid` answering each slot as given. */
async function match(
  uid: string,
  opts: { mode?: "ranked" | "async" | "friend"; status?: "active" | "finished"; ghost?: boolean },
  slots: { q: string; correct: boolean; answer?: string | null }[],
) {
  const m = await db.query<{ id: string }>(`insert into matches (mode, status) values ($1, $2) returning id`, [
    opts.mode ?? "ranked",
    opts.status ?? "finished",
  ]);
  const mid = m.rows[0].id;
  await db.query(`insert into match_players (match_id, user_id, elo_before, is_ghost) values ($1, $2, 900, $3)`, [mid, uid, opts.ghost ?? false]);
  for (const [i, s] of slots.entries()) {
    const slot = "ABC"[i];
    await db.query(`insert into match_questions (match_id, slot, question_id, points) values ($1, $2, $3, $4)`, [mid, slot, s.q, i + 1]);
    await db.query(
      `insert into submissions (match_id, user_id, slot, answer, correct, ms_from_start) values ($1, $2, $3, $4, $5, 1000)`,
      [mid, uid, slot, s.answer === undefined ? "1" : s.answer, s.correct],
    );
  }
  return mid;
}

async function practice(uid: string, right: boolean) {
  await rpc(db, uid, "next_practice_question", [1, null, null]);
  const r = await db.query<{ answer: string }>(
    `select q.answer from practice_state s join questions q on q.id = s.current_question_id where s.user_id = $1`,
    [uid],
  );
  return rpc(db, uid, "submit_practice_answer", [right ? r.rows[0].answer : String(Number(r.rows[0].answer) + 1)]);
}

describe("get_mastery", () => {
  test("new player: no rows", async () => {
    const a = await makeUser(db, "alice");
    expect(await mastery(a)).toEqual([]);
  });

  test("a real ranked duel and practice both count, grouped by the question's topic and tier", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    expect(await rpc(db, a, "join_queue")).toBeNull();
    const mid = await rpc<string>(db, b, "join_queue");
    await startedAgo(db, mid, 60);
    const play = async (uid: string, rights: boolean[]) => {
      for (const [i, slot] of ["A", "B", "C"].entries()) {
        const ans = await answerFor(db, mid, slot);
        const res = await rpc<{ status: string }>(db, uid, "submit_answer", [mid, slot, rights[i] ? ans : String(Number(ans) + 1)]);
        expect(res.status).toBe("ok");
      }
    };
    await play(a, [true, false, true]);
    expect(await mastery(a)).toEqual([]); // not finished yet
    await play(b, [false, false, false]); // both done → finished

    const tiers = await db.query<{ slot: string; tier: number }>(
      `select mq.slot, q.tier from match_questions mq join questions q on q.id = mq.question_id where mq.match_id = $1 order by slot`,
      [mid],
    );
    const duel = await mastery(a);
    expect(duel).toEqual(
      tiers.rows.map((t) => ({ topic: "Algebra", tier: t.tier, attempted: 1, correct: t.slot === "B" ? 0 : 1 })),
    );

    // Two practice answers on tier 1: one right, one wrong. Merge with any duel row on tier 1.
    await practice(a, true);
    await practice(a, false);
    const t1 = (await mastery(a)).find((r) => r.tier === 1)!;
    const duelT1 = duel.find((r) => r.tier === 1) ?? { attempted: 0, correct: 0 };
    expect(t1).toEqual({ topic: "Algebra", tier: 1, attempted: duelT1.attempted + 2, correct: duelT1.correct + 1 });
    expect((await mastery(b)).every((r) => r.correct === 0)).toBe(true);
  });

  test("skips and focus forfeits count as attempted, not correct", async () => {
    const a = await makeUser(db, "alice");
    await rpc(db, a, "next_practice_question", [2, null, null]);
    await rpc(db, a, "skip_practice_question");
    await match(a, {}, [{ q: await question("ranked", 2, 0), correct: false, answer: null }]);
    expect(await mastery(a)).toEqual([{ topic: "Algebra", tier: 2, attempted: 2, correct: 0 }]);
  });

  test("counts ranked and async duels; not friend games, unfinished duels or ghost seats", async () => {
    const a = await makeUser(db, "alice");
    const q = await question("ranked", 3, 0, "Geometry");
    await match(a, { mode: "ranked" }, [{ q, correct: true }]);
    await match(a, { mode: "async" }, [{ q, correct: false }]);
    await match(a, { mode: "friend" }, [{ q, correct: true }]);
    await match(a, { mode: "ranked", status: "active" }, [{ q, correct: true }]);
    await match(a, { mode: "async", ghost: true }, [{ q, correct: true }]);
    expect(await mastery(a)).toEqual([{ topic: "Geometry", tier: 3, attempted: 2, correct: 1 }]);
  });

  test("rows per topic and tier, sorted; only the asked-for player's answers", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    await match(a, {}, [
      { q: await question("ranked", 4, 0, "Sequences"), correct: true },
      { q: await question("ranked", 1, 0, "Calculus"), correct: true },
      { q: await question("ranked", 4, 1, "Sequences"), correct: false },
    ]);
    await match(b, {}, [{ q: await question("ranked", 1, 1, "Calculus"), correct: false }]);
    expect(await mastery(a)).toEqual([
      { topic: "Calculus", tier: 1, attempted: 1, correct: 1 },
      { topic: "Sequences", tier: 4, attempted: 2, correct: 1 },
    ]);
  });

  test("public read: anyone can ask about any player; signed out with no player is empty", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    await match(a, {}, [{ q: await question("ranked", 5, 0), correct: true }]);
    const want = [{ topic: "Algebra", tier: 5, attempted: 1, correct: 1 }];
    expect(await mastery(b, a)).toEqual(want);
    expect(await mastery(null, a)).toEqual(want);
    expect(await mastery(null)).toEqual([]);
  });
});
