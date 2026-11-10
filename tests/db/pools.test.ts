import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, createDb, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

// Question pools: practice reveals answers, so ranked and practice never share questions.

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db, 5, "ranked");
  await seedQuestions(db, 5, "practice");
});

const poolOf = async (questionIds: string[]) =>
  (await db.query<{ pool: string }>(`select pool from questions where id = any ($1::uuid[])`, [questionIds])).rows.map(
    (r) => r.pool,
  );

async function rankedMatch() {
  const a = await makeUser(db, "alice");
  const b = await makeUser(db, "bob");
  await rpc(db, a, "join_queue");
  const mid = await rpc<string>(db, b, "join_queue");
  return { a, b, mid };
}

async function finishAll(mid: string, uids: string[]) {
  await startedAgo(db, mid, 60);
  for (const uid of uids) {
    for (const slot of ["A", "B", "C"]) {
      await rpc(db, uid, "submit_answer", [mid, slot, await answerFor(db, mid, slot)]);
    }
  }
}

describe("question pools", () => {
  test("existing and new questions default to ranked", async () => {
    await db.query(`insert into questions (tier, topic, prompt, answer) values (1, 'x', 'no pool given', '1')`);
    const r = await db.query<{ pool: string }>(`select pool from questions where prompt = 'no pool given'`);
    expect(r.rows[0].pool).toBe("ranked");
  });

  test("pool must be ranked or practice", async () => {
    await expect(
      db.query(`insert into questions (tier, topic, prompt, answer, pool) values (1, 'x', 'y', '1', 'other')`),
    ).rejects.toThrow();
  });

  test("ranked matches only use ranked questions", async () => {
    for (let i = 0; i < 5; i++) {
      const a = await makeUser(db, `alice${i}`);
      const b = await makeUser(db, `bobby${i}`);
      await rpc(db, a, "join_queue");
      const mid = await rpc<string>(db, b, "join_queue");
      const ids = (await db.query<{ question_id: string }>(`select question_id from match_questions where match_id = $1`, [mid])).rows;
      expect(await poolOf(ids.map((r) => r.question_id))).toEqual(["ranked", "ranked", "ranked"]);
    }
  });

  test("friend matches only use ranked questions", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    const { code } = await rpc<{ match_id: string; code: string }>(db, a, "create_friend_match");
    const mid = await rpc<string>(db, b, "join_friend_match", [code]);
    const ids = (await db.query<{ question_id: string }>(`select question_id from match_questions where match_id = $1`, [mid])).rows;
    expect(await poolOf(ids.map((r) => r.question_id))).toEqual(["ranked", "ranked", "ranked"]);
  });

  test("ranked with no ranked questions left fails even if practice has some", async () => {
    await db.query(`update questions set active = false where pool = 'ranked' and tier = 3`);
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    await rpc(db, a, "join_queue");
    await expect(rpc(db, b, "join_queue")).rejects.toThrow("no_questions_for_tier 3");
  });

  test("practice only serves practice questions", async () => {
    const uid = await makeUser(db, "solo");
    for (let i = 0; i < 12; i++) {
      const q = await rpc<{ question_id: string }>(db, uid, "next_practice_question", [3]);
      expect(await poolOf([q.question_id])).toEqual(["practice"]);
      await rpc(db, uid, "skip_practice_question");
    }
  });

  test("practice with no practice questions fails even if ranked has some", async () => {
    await db.query(`update questions set active = false where pool = 'practice' and tier = 2`);
    const uid = await makeUser(db, "solo");
    await expect(rpc(db, uid, "next_practice_question", [2])).rejects.toThrow("no_questions_for_tier 2");
  });

  test("recorded runs aren't replayed once a question leaves the ranked pool", async () => {
    const { a, b, mid } = await rankedMatch();
    await finishAll(mid, [a, b]);
    const carl = await makeUser(db, "carl");

    // retire one of the run's questions to practice
    await db.query(
      `update questions set pool = 'practice'
        where id = (select question_id from match_questions where match_id = $1 and slot = 'B')`,
      [mid],
    );
    await rpc(db, carl, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '31 seconds' where user_id = $1`, [carl]);
    expect(await rpc(db, carl, "join_queue")).toBeNull();

    // back in the ranked pool → the run is replayable again
    await db.query(`update questions set pool = 'ranked' where pool = 'practice' and id in (select question_id from match_questions where match_id = $1)`, [mid]);
    expect(await rpc(db, carl, "join_queue")).toBeTruthy();
  });

  test("recorded runs aren't replayed once a question is deactivated", async () => {
    const { a, b, mid } = await rankedMatch();
    await finishAll(mid, [a, b]);
    const carl = await makeUser(db, "carl");
    await db.query(
      `update questions set active = false
        where id = (select question_id from match_questions where match_id = $1 and slot = 'A')`,
      [mid],
    );
    await rpc(db, carl, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '31 seconds' where user_id = $1`, [carl]);
    expect(await rpc(db, carl, "join_queue")).toBeNull();
  });
});
