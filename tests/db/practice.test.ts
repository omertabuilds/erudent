import { beforeEach, describe, expect, test } from "vitest";
import { asUser, createDb, makeUser, rpc, seedQuestions, type Db } from "./harness";

// Practice mode: solo, unrated, endless. One question at a time, answers revealed only after an attempt.

type Served = { question_id: string; tier: number; topic: string; prompt: string; auto: boolean; selected_tier: number };
type Result = { status: string; correct?: boolean; answer?: string; solution?: string; streak?: number; tier?: number };
type Stats = {
  attempted: number;
  correct: number;
  streak: number;
  best_streak: number;
  auto: boolean;
  tier: number | null;
  by_tier: { tier: number; attempted: number; correct: number }[];
};

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db);
});

const next = (uid: string, tier: number | null = null) => rpc<Served>(db, uid, "next_practice_question", [tier]);
const submit = (uid: string, answer: string) => rpc<Result>(db, uid, "submit_practice_answer", [answer]);
const skip = (uid: string) => rpc<Result>(db, uid, "skip_practice_question");
const stats = (uid: string) => rpc<Stats>(db, uid, "practice_stats");

/** The served question's answer (admin view, for tests only). */
async function servedAnswer(uid: string) {
  const r = await db.query<{ answer: string }>(
    `select q.answer from practice_state s join questions q on q.id = s.current_question_id where s.user_id = $1`,
    [uid],
  );
  return r.rows[0].answer;
}

async function answerRight(uid: string, tier: number | null = null) {
  await next(uid, tier);
  return submit(uid, await servedAnswer(uid));
}

async function answerWrong(uid: string, tier: number | null = null) {
  await next(uid, tier);
  return submit(uid, String(Number(await servedAnswer(uid)) + 1));
}

describe("who can practice", () => {
  test("no invitation code → no_access", async () => {
    const uid = await makeUser(db, "nocode", 900, 0, false);
    await expect(next(uid)).rejects.toThrow("no_access");
    await expect(submit(uid, "1")).rejects.toThrow("no_access");
    await expect(skip(uid)).rejects.toThrow("no_access");
  });

  test("flagged username → needs_rename", async () => {
    const uid = await makeUser(db, "oldname");
    await db.query(`insert into private.username_flags (user_id) values ($1)`, [uid]);
    await expect(next(uid)).rejects.toThrow("needs_rename");
    await expect(submit(uid, "1")).rejects.toThrow("needs_rename");
  });

  test("not during a live duel, so practice can't reveal a question on the match screen", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    expect(await rpc(db, a, "join_queue")).toBeNull();
    expect(await rpc(db, b, "join_queue")).toBeTruthy();
    await expect(next(a)).rejects.toThrow("in_match");
    await expect(skip(a)).rejects.toThrow("in_match");
  });

  test("the browser can't read the practice tables", async () => {
    const uid = await makeUser(db, "alice");
    await next(uid);
    await expect(asUser(db, uid, `select * from practice_state`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, uid, `select * from practice_attempts`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, `select public.next_practice_question(null)`)).rejects.toThrow(/permission denied/);
  });
});

describe("serving questions", () => {
  test("the payload has no answer or solution", async () => {
    const uid = await makeUser(db, "alice");
    const q = await next(uid);
    expect(Object.keys(q).sort()).toEqual(["auto", "prompt", "question_id", "selected_tier", "tier", "topic"]);
    expect(JSON.stringify(q)).not.toMatch(/because/); // seeded solution text
  });

  test("asking twice without answering returns the same question", async () => {
    const uid = await makeUser(db, "alice");
    const first = await next(uid);
    expect((await next(uid)).question_id).toBe(first.question_id);
    // Changing tier saves the setting but can't reroll the question on screen either.
    const other = await next(uid, first.tier === 1 ? 2 : 1);
    expect(other.question_id).toBe(first.question_id);
    expect(other.selected_tier).not.toBe(first.tier);
  });

  test("prefers questions never attempted and never seen in a duel", async () => {
    const uid = await makeUser(db, "alice");
    const ids = (await db.query<{ id: string }>(`select id from questions where tier = 2 order by prompt`)).rows.map((r) => r.id);
    // Seen in duels: all but the last one.
    for (const id of ids.slice(0, -1)) {
      await db.query(`insert into seen_questions (user_id, question_id) values ($1, $2)`, [uid, id]);
    }
    expect((await next(uid, 2)).question_id).toBe(ids.at(-1));
  });

  test("works through the whole tier, then falls back to the least recently attempted", async () => {
    const uid = await makeUser(db, "alice");
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      order.push((await next(uid, 4)).question_id);
      await skip(uid);
    }
    expect(new Set(order).size).toBe(5); // all five tier-4 questions, no repeats
    for (let i = 0; i < 5; i++) {
      expect((await next(uid, 4)).question_id).toBe(order[i]);
      await skip(uid);
    }
  });

  test("an empty tier raises no_questions_for_tier and saves nothing", async () => {
    const uid = await makeUser(db, "alice");
    await db.query(`update questions set active = false where tier = 5`);
    await expect(next(uid, 5)).rejects.toThrow("no_questions_for_tier 5");
    expect((await stats(uid)).auto).toBe(true);
    expect((await next(uid, 3)).tier).toBe(3);
  });
});

describe("answering", () => {
  test("correct answer: marked, answer and solution revealed, streak up", async () => {
    const uid = await makeUser(db, "alice");
    await next(uid, 2);
    const right = await servedAnswer(uid);
    const r = await submit(uid, right);
    expect(r).toEqual({ status: "ok", correct: true, answer: right, solution: "because", streak: 1, tier: 2 });
  });

  test("wrong answer: marked wrong, answer revealed, streak reset", async () => {
    const uid = await makeUser(db, "alice");
    await answerRight(uid, 2);
    const r = await answerWrong(uid, 2);
    expect(r.status).toBe("ok");
    expect(r.correct).toBe(false);
    expect(r.answer).toMatch(/^2\d\d$/);
    expect(r.streak).toBe(0);
  });

  test("invalid format doesn't use up the question", async () => {
    const uid = await makeUser(db, "alice");
    const q = await next(uid);
    expect(await submit(uid, "0.5")).toEqual({ status: "invalid_format" });
    expect(await submit(uid, "")).toEqual({ status: "invalid_format" });
    expect((await next(uid)).question_id).toBe(q.question_id);
    expect((await submit(uid, await servedAnswer(uid))).correct).toBe(true);
  });

  test("fractions are compared normalized", async () => {
    const uid = await makeUser(db, "alice");
    await next(uid, 1);
    const right = await servedAnswer(uid);
    expect((await submit(uid, `${Number(right) * 2}/2`)).correct).toBe(true);
  });

  test("nothing served → no_question, and an answer can't be used twice", async () => {
    const uid = await makeUser(db, "alice");
    expect(await submit(uid, "1")).toEqual({ status: "no_question" });
    expect(await skip(uid)).toEqual({ status: "no_question" });
    await answerRight(uid);
    expect(await submit(uid, "1")).toEqual({ status: "no_question" });
  });

  test("skip reveals the answer, counts as wrong, records a null answer", async () => {
    const uid = await makeUser(db, "alice");
    await answerRight(uid, 3);
    const q = await next(uid, 3);
    const right = await servedAnswer(uid);
    const r = await skip(uid);
    expect(r).toEqual({ status: "ok", correct: false, answer: right, solution: "because", streak: 0, tier: 3 });
    const a = await db.query(`select answer, correct from practice_attempts where question_id = $1`, [q.question_id]);
    expect(a.rows).toEqual([{ answer: null, correct: false }]);
  });

  test("revealed questions land in seen_questions, so ranked steers away from them", async () => {
    const uid = await makeUser(db, "alice");
    const q1 = await next(uid);
    await submit(uid, "0.5"); // invalid: not revealed
    let seen = await db.query<{ question_id: string }>(`select question_id from seen_questions where user_id = $1`, [uid]);
    expect(seen.rows).toEqual([]);
    await submit(uid, "1");
    const q2 = await next(uid);
    await skip(uid);
    seen = await db.query<{ question_id: string }>(`select question_id from seen_questions where user_id = $1`, [uid]);
    expect(seen.rows.map((r) => r.question_id).sort()).toEqual([q1.question_id, q2.question_id].sort());
  });
});

describe("tiers", () => {
  test("auto starts at the player's Elo tier", async () => {
    const uid = await makeUser(db, "alice", 1150); // Savant
    const q = await next(uid);
    expect(q).toMatchObject({ tier: 4, auto: true, selected_tier: 4 });
  });

  test("auto: up after 2 right in a row, down after 1 wrong", async () => {
    const uid = await makeUser(db, "alice", 900); // tier 3
    expect((await answerRight(uid)).tier).toBe(3);
    expect((await answerRight(uid)).tier).toBe(4);
    expect((await next(uid)).tier).toBe(4);
    await skip(uid);
    expect((await next(uid)).tier).toBe(3);
    expect((await answerRight(uid)).tier).toBe(3); // the run restarts after a move
    expect((await answerWrong(uid)).tier).toBe(2);
  });

  test("auto stays within 1–6", async () => {
    const top = await makeUser(db, "top", 1600);
    for (let i = 0; i < 4; i++) expect((await answerRight(top)).tier).toBe(6);
    const bottom = await makeUser(db, "bottom", 500);
    for (let i = 0; i < 3; i++) expect((await answerWrong(bottom)).tier).toBe(1);
  });

  test("manual tier sticks; null switches back to auto from the Elo tier", async () => {
    const uid = await makeUser(db, "alice", 900);
    for (let i = 0; i < 3; i++) {
      const r = await answerRight(uid, 5);
      expect(r.tier).toBe(5);
    }
    expect((await answerWrong(uid, 5)).tier).toBe(5);
    const served = await next(uid, 5);
    expect(served).toMatchObject({ tier: 5, auto: false, selected_tier: 5 });
    expect(await stats(uid)).toMatchObject({ auto: false, tier: 5 });
    await skip(uid);

    const auto = await next(uid);
    expect(auto).toMatchObject({ tier: 3, auto: true, selected_tier: 3 });
  });

  test("bad tier numbers are refused", async () => {
    const uid = await makeUser(db, "alice");
    await expect(next(uid, 7)).rejects.toThrow("invalid_tier");
    await expect(next(uid, 0)).rejects.toThrow("invalid_tier");
  });
});

describe("stats", () => {
  test("totals, streaks and per-tier counts", async () => {
    const uid = await makeUser(db, "alice");
    expect(await stats(uid)).toEqual({ attempted: 0, correct: 0, streak: 0, best_streak: 0, auto: true, tier: null, by_tier: [] });

    await answerRight(uid, 1);
    await answerRight(uid, 1);
    await answerRight(uid, 2);
    await answerWrong(uid, 2);
    await next(uid, 4);
    await skip(uid);
    await answerRight(uid, 4);

    expect(await stats(uid)).toEqual({
      attempted: 6,
      correct: 4,
      streak: 1,
      best_streak: 3,
      auto: false,
      tier: 4,
      by_tier: [
        { tier: 1, attempted: 2, correct: 2 },
        { tier: 2, attempted: 2, correct: 1 },
        { tier: 4, attempted: 2, correct: 1 },
      ],
    });
  });

  test("Elo, matches played and record never change", async () => {
    const uid = await makeUser(db, "alice", 1234, 17);
    const before = await db.query(`select elo, matches_played, wins, losses, draws from profiles where id = $1`, [uid]);
    for (let i = 0; i < 3; i++) await answerRight(uid);
    await answerWrong(uid);
    await next(uid);
    await skip(uid);
    const after = await db.query(`select elo, matches_played, wins, losses, draws from profiles where id = $1`, [uid]);
    expect(after.rows).toEqual(before.rows);
  });
});

describe("reporting", () => {
  test("a question you've attempted can be reported, without a match", async () => {
    const uid = await makeUser(db, "alice");
    const q = await next(uid);
    await skip(uid);
    await rpc(db, uid, "report_practice_question", [q.question_id, "answer is wrong"]);
    await rpc(db, uid, "report_practice_question", [q.question_id, "again"]); // no duplicate
    const r = await db.query(`select reporter_id, match_id, kind, question_id, reason from reports`);
    expect(r.rows).toEqual([{ reporter_id: uid, match_id: null, kind: "question", question_id: q.question_id, reason: "answer is wrong" }]);
  });

  test("a question you haven't attempted can't be", async () => {
    const uid = await makeUser(db, "alice");
    const q = await next(uid); // served, not attempted
    await expect(rpc(db, uid, "report_practice_question", [q.question_id, "x"])).rejects.toThrow("not_attempted");
  });

  test("player reports still need a match", async () => {
    const uid = await makeUser(db, "alice");
    await expect(
      db.query(`insert into reports (reporter_id, kind, reported_user_id, reason) values ($1, 'player', $1, 'x')`, [uid]),
    ).rejects.toThrow(/reports_player_needs_match/);
  });
});
