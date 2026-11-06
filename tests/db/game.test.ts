import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, asUser, createDb, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

type MatchState = {
  status: string;
  mode: string;
  invite_code: string | null;
  started_at: string;
  me: { score: number; result: string | null; elo_before: number; elo_after: number | null; focus_strikes: number; answers: { slot: string; answer: string | null; correct: boolean }[] };
  opponent: { username: string; is_ghost: boolean; solved: string[]; score: number | null; result: string | null } | null;
  questions: { slot: string; points: number; tier: number; prompt: string; answer?: string; solution?: string }[];
};

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db);
});

async function rankedMatch(eloA = 900, eloB = 900, playedA = 0, playedB = 0) {
  const a = await makeUser(db, "alice", eloA, playedA);
  const b = await makeUser(db, "bob", eloB, playedB);
  expect(await rpc(db, a, "join_queue")).toBeNull();
  const mid = await rpc<string>(db, b, "join_queue");
  expect(mid).toBeTruthy();
  return { a, b, mid };
}

async function answerAll(uid: string, mid: string, correct: Record<string, boolean>) {
  for (const slot of ["A", "B", "C"]) {
    const right = await answerFor(db, mid, slot);
    const res = await rpc<{ status: string; correct: boolean }>(db, uid, "submit_answer", [
      mid,
      slot,
      correct[slot] ? right : String(Number(right) + 1),
    ]);
    expect(res.status).toBe("ok");
  }
}

describe("answers", () => {
  test("normalizes integers and fractions, rejects decimals", async () => {
    const r = await db.query<Record<string, string | null>>(`
      select normalize_answer('6/8') a, normalize_answer(' -3 / -4 ') b, normalize_answer('007') c,
             normalize_answer('0.5') d, normalize_answer('4/2') e, normalize_answer('3/0') f,
             normalize_answer('-0') g, normalize_answer('5/-10') h, normalize_answer('abc') i`);
    expect(r.rows[0]).toEqual({ a: "3/4", b: "3/4", c: "7", d: null, e: "2", f: null, g: "0", h: "-1/2", i: null });
  });

  test("questions with decimal answers are rejected on import", async () => {
    await expect(
      db.query(`insert into questions (tier, topic, prompt, answer) values (1, 'x', 'y', '0.5')`),
    ).rejects.toThrow(/invalid_answer_format/);
  });
});

describe("profiles", () => {
  test("under 13 is blocked and birth date isn't stored", async () => {
    const id = crypto.randomUUID();
    await db.query(`insert into auth.users (id) values ($1)`, [id]);
    const young = new Date();
    young.setFullYear(young.getFullYear() - 12);
    await expect(rpc(db, id, "create_profile", ["kid", young.toISOString().slice(0, 10)])).rejects.toThrow(/too_young/);
    const cols = await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'profiles'`);
    expect(cols.rows.map((r) => r.column_name)).not.toContain("birth_date");
  });

  test("usernames keep their case and are unique ignoring it (full rules: usernames.test.ts)", async () => {
    await makeUser(db, "Alice_1");
    const id = crypto.randomUUID();
    await db.query(`insert into auth.users (id) values ($1)`, [id]);
    await expect(rpc(db, id, "create_profile", ["alice_1", "2000-01-01"])).rejects.toThrow(/username_taken/);
    await expect(rpc(db, id, "create_profile", ["a!", "2000-01-01"])).rejects.toThrow(/username_length/);
    const res = await db.query<{ username: string }>(`select username from profiles`);
    expect(res.rows).toEqual([{ username: "Alice_1" }]);
  });
});

describe("security", () => {
  test("browser can read profiles but nothing else", async () => {
    const { a } = await rankedMatch();
    expect((await asUser(db, a, `select * from profiles`)).length).toBe(2);
    for (const table of ["questions", "matches", "match_questions", "match_players", "submissions", "queue", "flags", "reports"]) {
      await expect(asUser(db, a, `select * from ${table}`)).rejects.toThrow(/permission denied/);
    }
  });

  test("internal functions can't be called from the browser", async () => {
    const { a, mid } = await rankedMatch();
    await expect(asUser(db, a, `select private.finish_match($1, null)`, [mid])).rejects.toThrow(/permission denied/);
  });

  test("signed-out users can't play", async () => {
    await expect(asUser(db, null, `select public.join_queue()`)).rejects.toThrow(/permission denied/);
  });

  test("outsiders can't see a match", async () => {
    const { mid } = await rankedMatch();
    const eve = await makeUser(db, "eve");
    await expect(rpc(db, eve, "get_match", [mid])).rejects.toThrow(/not_participant/);
  });

  test("prompts hidden before start, answers hidden until finished", async () => {
    const { a, mid } = await rankedMatch();
    let m = await rpc<MatchState>(db, a, "get_match", [mid]);
    expect(m.questions).toEqual([]);
    await startedAgo(db, mid, 1);
    m = await rpc<MatchState>(db, a, "get_match", [mid]);
    expect(m.questions).toHaveLength(3);
    expect(m.questions[0].answer).toBeUndefined();
    expect(m.questions[0].solution).toBeUndefined();
  });
});

describe("ranked match", () => {
  test("A/B/C come from one tier below, at, and above", async () => {
    const { a, mid } = await rankedMatch(1000, 1000); // Scholar (tier 3)
    await startedAgo(db, mid, 1);
    const m = await rpc<MatchState>(db, a, "get_match", [mid]);
    expect(m.questions.map((q) => [q.slot, q.tier, q.points])).toEqual([["A", 2, 1], ["B", 3, 2], ["C", 4, 3]]);
  });

  test("tiers clamp at Novice and Erudite", async () => {
    const low = await rankedMatch(500, 500);
    await startedAgo(db, low.mid, 1);
    expect((await rpc<MatchState>(db, low.a, "get_match", [low.mid])).questions.map((q) => q.tier)).toEqual([1, 1, 2]);

    const c = await makeUser(db, "carl", 1700);
    const d = await makeUser(db, "dana", 1700);
    await rpc(db, c, "join_queue");
    const mid = await rpc<string>(db, d, "join_queue");
    await startedAgo(db, mid, 1);
    expect((await rpc<MatchState>(db, c, "get_match", [mid])).questions.map((q) => q.tier)).toEqual([5, 6, 6]);
  });

  test("full match: scoring, opponent progress, Elo, seen questions", async () => {
    const { a, b, mid } = await rankedMatch();
    await startedAgo(db, mid, 60);

    expect((await rpc<{ status: string }>(db, a, "submit_answer", [mid, "A", "1.5"])).status).toBe("invalid_format");
    const first = await rpc<{ status: string; correct: boolean }>(db, a, "submit_answer", [mid, "A", await answerFor(db, mid, "A")]);
    expect(first).toEqual({ status: "ok", correct: true });
    expect((await rpc<{ status: string }>(db, a, "submit_answer", [mid, "A", "1"])).status).toBe("already_answered");

    // Bob sees that Alice solved A, but not her answer
    const bobView = await rpc<MatchState>(db, b, "get_match", [mid]);
    expect(bobView.opponent?.solved).toEqual(["A"]);
    expect(JSON.stringify(bobView.opponent)).not.toContain(await answerFor(db, mid, "A"));

    await rpc(db, a, "submit_answer", [mid, "B", await answerFor(db, mid, "B")]);
    await rpc(db, a, "submit_answer", [mid, "C", "1"]); // wrong
    await answerAll(b, mid, { A: true, B: false, C: false });

    const done = await rpc<MatchState>(db, a, "get_match", [mid]);
    expect(done.status).toBe("finished");
    expect(done.me.score).toBe(3);
    expect(done.me.result).toBe("win");
    expect(done.opponent?.score).toBe(1);
    expect(done.questions[0].answer).toBeDefined(); // revealed after finish

    // equal ratings, placement K=80 → ±40
    const elo = await db.query<{ username: string; elo: number; matches_played: number; wins: number }>(
      `select username, elo, matches_played, wins from profiles order by username`,
    );
    expect(elo.rows).toEqual([
      { username: "alice", elo: 940, matches_played: 1, wins: 1 },
      { username: "bob", elo: 860, matches_played: 1, wins: 0 },
    ]);
    const seen = await db.query(`select count(*)::int n from seen_questions`);
    expect(seen.rows[0]).toEqual({ n: 6 });
  });

  test("after placement K drops to 20", async () => {
    const { a, b, mid } = await rankedMatch(1000, 1000, 10, 10);
    await startedAgo(db, mid, 60);
    await answerAll(a, mid, { A: true, B: true, C: true });
    await answerAll(b, mid, { A: false, B: false, C: false });
    const r = await db.query<{ elo: number }>(`select elo from profiles order by username`);
    expect(r.rows.map((x) => x.elo)).toEqual([1010, 990]);
  });

  test("same score: faster total time wins; zero each is a draw", async () => {
    const { a, b, mid } = await rankedMatch();
    await startedAgo(db, mid, 60);
    await rpc(db, a, "submit_answer", [mid, "B", await answerFor(db, mid, "B")]);
    await startedAgo(db, mid, 120); // Bob answers "later" relative to start
    await rpc(db, b, "submit_answer", [mid, "B", await answerFor(db, mid, "B")]);
    await db.query(`update matches set ends_at = now() - interval '1 second' where id = $1`, [mid]);
    const res = await rpc<MatchState>(db, a, "finish_match", [mid]);
    expect(res.me.result).toBe("win");

    const db2 = await rankedDraw();
    expect(db2).toBe("draw");
  });

  async function rankedDraw() {
    const c = await makeUser(db, "cara");
    const d = await makeUser(db, "dave");
    await rpc(db, c, "join_queue");
    const mid = await rpc<string>(db, d, "join_queue");
    await db.query(`update matches set started_at = now() - interval '6 minutes', ends_at = now() - interval '1 minute' where id = $1`, [mid]);
    return (await rpc<MatchState>(db, c, "finish_match", [mid])).me.result;
  }

  test("time up: answers after the clock are refused and the match finishes", async () => {
    const { a, mid } = await rankedMatch();
    await db.query(`update matches set started_at = now() - interval '6 minutes', ends_at = now() - interval '1 minute' where id = $1`, [mid]);
    expect((await rpc<{ status: string }>(db, a, "submit_answer", [mid, "A", "1"])).status).toBe("time_up");
    expect((await rpc<MatchState>(db, a, "get_match", [mid])).status).toBe("finished");
  });

  test("players who've seen a question don't get it again while others exist", async () => {
    const { a, b, mid } = await rankedMatch();
    await startedAgo(db, mid, 60);
    await answerAll(a, mid, { A: true, B: true, C: true });
    await answerAll(b, mid, { A: true, B: true, C: true });
    const first = await db.query<{ question_id: string }>(`select question_id from match_questions where match_id = $1`, [mid]);

    await rpc(db, a, "join_queue");
    const mid2 = await rpc<string>(db, b, "join_queue");
    const second = await db.query<{ question_id: string }>(`select question_id from match_questions where match_id = $1`, [mid2]);
    const firstIds = new Set(first.rows.map((r) => r.question_id));
    expect(second.rows.some((r) => firstIds.has(r.question_id))).toBe(false);
  });
});

describe("matchmaking", () => {
  test("300 apart: no match at first, match after 15s", async () => {
    const a = await makeUser(db, "alice", 900);
    const b = await makeUser(db, "bob", 1200);
    expect(await rpc(db, a, "join_queue")).toBeNull();
    expect(await rpc(db, b, "join_queue")).toBeNull();
    await db.query(`update queue set joined_at = now() - interval '16 seconds'`);
    expect(await rpc(db, b, "join_queue")).toBeTruthy();
  });

  test("more than 400 apart never matches live", async () => {
    const a = await makeUser(db, "alice", 900);
    const b = await makeUser(db, "bob", 1350);
    await rpc(db, a, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '20 seconds'`);
    expect(await rpc(db, b, "join_queue")).toBeNull();
  });

  test("players who stopped polling are skipped", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    await rpc(db, a, "join_queue");
    await db.query(`update queue set last_poll = now() - interval '11 seconds'`);
    expect(await rpc(db, b, "join_queue")).toBeNull();
  });

  test("an active match is resumed instead of queueing", async () => {
    const { a, mid } = await rankedMatch();
    expect(await rpc(db, a, "join_queue")).toBe(mid);
    expect(await rpc(db, a, "my_active_match")).toBe(mid);
  });
});

describe("async match", () => {
  test("after 30s alone, you play a recorded run and only your Elo changes", async () => {
    const { a, b, mid } = await rankedMatch();
    await startedAgo(db, mid, 60);
    await answerAll(a, mid, { A: true, B: true, C: false });
    await answerAll(b, mid, { A: false, B: false, C: false });
    const aliceElo = (await db.query<{ elo: number }>(`select elo from profiles where id = $1`, [a])).rows[0].elo;

    const carl = await makeUser(db, "carl", 900);
    expect(await rpc(db, carl, "join_queue")).toBeNull();
    await db.query(`update queue set joined_at = now() - interval '31 seconds' where user_id = $1`, [carl]);
    const amid = await rpc<string>(db, carl, "join_queue");
    expect(amid).toBeTruthy();

    let m = await rpc<MatchState>(db, carl, "get_match", [amid]);
    expect(m.mode).toBe("async");
    expect(m.opponent?.is_ghost).toBe(true);
    expect(["alice", "bob"]).toContain(m.opponent?.username);

    // ghost progress only shows answers up to the elapsed time
    await startedAgo(db, amid, 0.001);
    m = await rpc<MatchState>(db, carl, "get_match", [amid]);
    expect(m.opponent?.solved).toEqual([]);

    await startedAgo(db, amid, 120);
    await answerAll(carl, amid, { A: true, B: true, C: true });
    m = await rpc<MatchState>(db, carl, "get_match", [amid]);
    expect(m.status).toBe("finished");
    expect(m.me.result).toBe("win");
    const after = (await db.query<{ elo: number }>(`select elo from profiles where id = $1`, [a])).rows[0].elo;
    expect(after).toBe(aliceElo); // the recorded player's rating doesn't move
  });

  test("no recorded run available: keep waiting", async () => {
    const carl = await makeUser(db, "carl");
    await rpc(db, carl, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '31 seconds'`);
    expect(await rpc(db, carl, "join_queue")).toBeNull();
  });
});

describe("friend match", () => {
  test("invite code works and nobody's Elo changes", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    const { match_id, code } = await rpc<{ match_id: string; code: string }>(db, a, "create_friend_match");
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect((await rpc<MatchState>(db, a, "get_match", [match_id])).status).toBe("waiting");

    expect(await rpc(db, b, "join_friend_match", [code.toLowerCase()])).toBe(match_id);
    const c = await makeUser(db, "carl");
    await expect(rpc(db, c, "join_friend_match", [code])).rejects.toThrow(/match_full/);

    await startedAgo(db, match_id, 60);
    await answerAll(a, match_id, { A: true, B: true, C: true });
    await answerAll(b, match_id, { A: false, B: false, C: false });
    const m = await rpc<MatchState>(db, a, "get_match", [match_id]);
    expect(m.me.result).toBe("win");
    expect(m.me.elo_after).toBe(m.me.elo_before);
    const elos = await db.query<{ elo: number; matches_played: number }>(`select elo, matches_played from profiles`);
    expect(elos.rows.every((r) => r.elo === 900 && r.matches_played === 0)).toBe(true);
  });

  test("host waiting in the lobby isn't counted as disconnected", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    const { match_id, code } = await rpc<{ match_id: string; code: string }>(db, a, "create_friend_match");
    await db.query(`update match_players set last_seen = now() - interval '2 minutes' where user_id = $1`, [a]);
    await rpc(db, b, "join_friend_match", [code]);
    await startedAgo(db, match_id, 1);
    expect(await rpc(db, b, "claim_forfeit", [match_id])).toEqual({ status: "opponent_connected" });
  });

  test("bad code is rejected", async () => {
    const a = await makeUser(db, "alice");
    await expect(rpc(db, a, "join_friend_match", ["ZZZZZZ"])).rejects.toThrow(/invalid_code/);
  });
});

describe("anti-cheat", () => {
  test("focus mode: first tab switch warns, second forfeits the question on screen", async () => {
    const { a, mid } = await rankedMatch();
    await startedAgo(db, mid, 30);
    expect(await rpc(db, a, "focus_event", [mid, "B"])).toEqual({ status: "warning" });
    expect(await rpc(db, a, "focus_event", [mid, "B"])).toEqual({ status: "forfeited_question", slot: "B" });
    expect((await rpc<{ status: string }>(db, a, "submit_answer", [mid, "B", await answerFor(db, mid, "B")])).status).toBe("already_answered");
    const flags = await db.query(`select reason from flags`);
    expect(flags.rows).toEqual([{ reason: "tab_switch" }]);
  });

  test("focus mode is off in friend matches", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    const { code, match_id } = await rpc<{ match_id: string; code: string }>(db, a, "create_friend_match");
    await rpc(db, b, "join_friend_match", [code]);
    await startedAgo(db, match_id, 30);
    expect(await rpc(db, a, "focus_event", [match_id, "A"])).toEqual({ status: "ignored" });
  });

  test("solving the hard question too fast gets flagged", async () => {
    const { a, mid } = await rankedMatch();
    await startedAgo(db, mid, 5);
    await rpc(db, a, "submit_answer", [mid, "C", await answerFor(db, mid, "C")]);
    const flags = await db.query<{ reason: string }>(`select reason from flags`);
    expect(flags.rows[0].reason).toMatch(/^too_fast:C:/);
  });

  test("a normal pace isn't flagged", async () => {
    const { a, mid } = await rankedMatch();
    await startedAgo(db, mid, 90);
    await rpc(db, a, "submit_answer", [mid, "C", await answerFor(db, mid, "C")]);
    expect((await db.query(`select * from flags`)).rows).toHaveLength(0);
  });

  test("disconnect: opponent silent for 30s forfeits", async () => {
    const { a, b, mid } = await rankedMatch();
    await startedAgo(db, mid, 60);
    expect(await rpc(db, a, "claim_forfeit", [mid])).toEqual({ status: "opponent_connected" });
    await db.query(`update match_players set last_seen = now() - interval '31 seconds' where user_id = $1`, [b]);
    expect(await rpc(db, a, "claim_forfeit", [mid])).toEqual({ status: "opponent_forfeited" });
    const m = await rpc<MatchState>(db, a, "get_match", [mid]);
    expect(m.me.result).toBe("win");
  });

  test("reports are saved", async () => {
    const { a, mid } = await rankedMatch();
    await rpc(db, a, "report_question", [mid, "A", "two valid answers"]);
    await rpc(db, a, "report_player", [mid, "solved C in 3 seconds"]);
    const r = await db.query(`select kind from reports order by id`);
    expect(r.rows).toEqual([{ kind: "question" }, { kind: "player" }]);
  });
});

describe("leaderboard", () => {
  test("only players past placement, ranked by Elo", async () => {
    await makeUser(db, "newbie", 1600, 3);
    await makeUser(db, "sage", 1400, 12);
    await makeUser(db, "erudite", 1550, 20);
    const anon = await asUser<{ place: number; username: string; rank: string }>(
      db, null, `select place, username, rank from public.get_leaderboard(100)`,
    );
    expect(anon).toEqual([
      { place: 1, username: "erudite", rank: "Erudite" },
      { place: 2, username: "sage", rank: "Sage" },
    ]);
  });
});
