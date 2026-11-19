import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, asUser, createDb, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

// forfeit_match, and the solve times get_match returns (answered_at, solved_at, resigned).

type Answer = { slot: string; answer: string | null; correct: boolean; answered_at: string };
type MatchState = {
  status: string;
  mode: string;
  started_at: string;
  forfeited_by: string | null;
  resigned: boolean;
  me: { user_id: string; result: string | null; elo_before: number; elo_after: number | null; answers: Answer[] };
  opponent: { is_ghost: boolean; result: string | null; elo_after: number | null; solved: string[]; solved_at: Record<string, string> } | null;
};

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db);
});

const forfeit = (uid: string, mid: string) => rpc<{ status: string }>(db, uid, "forfeit_match", [mid]);
const getMatch = (uid: string, mid: string) => rpc<MatchState>(db, uid, "get_match", [mid]);
const profile = async (uid: string) =>
  (await db.query<{ elo: number; matches_played: number; wins: number; losses: number }>(
    `select elo, matches_played, wins, losses from profiles where id = $1`,
    [uid],
  )).rows[0];

async function rankedMatch() {
  const a = await makeUser(db, "alice");
  const b = await makeUser(db, "bob");
  expect(await rpc(db, a, "join_queue")).toBeNull();
  const mid = await rpc<string>(db, b, "join_queue");
  await startedAgo(db, mid, 60);
  return { a, b, mid };
}

async function answer(uid: string, mid: string, slot: string, right = true) {
  const ans = await answerFor(db, mid, slot);
  return rpc<{ status: string }>(db, uid, "submit_answer", [mid, slot, right ? ans : String(Number(ans) + 1)]);
}

describe("forfeit_match", () => {
  test("ranked: loss for the caller, win for the opponent, Elo applied", async () => {
    const { a, b, mid } = await rankedMatch();
    await answer(a, mid, "A"); // Alice is ahead on points; forfeiting still loses
    expect(await forfeit(a, mid)).toEqual({ status: "forfeited" });

    const mine = await getMatch(a, mid);
    expect(mine.status).toBe("finished");
    expect(mine.forfeited_by).toBe(a);
    expect(mine.resigned).toBe(true);
    expect(mine.me.result).toBe("loss");
    expect(mine.opponent?.result).toBe("win");
    // Equal Elo, K = 80 during placement: ±40
    expect(mine.me.elo_after).toBe(860);
    expect(mine.opponent?.elo_after).toBe(940);
    expect(await profile(a)).toMatchObject({ elo: 860, matches_played: 1, wins: 0, losses: 1 });
    expect(await profile(b)).toMatchObject({ elo: 940, matches_played: 1, wins: 1, losses: 0 });
  });

  test("works during the countdown", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    await rpc(db, a, "join_queue");
    const mid = await rpc<string>(db, b, "join_queue");
    await db.query(`update matches set started_at = now() + interval '5 seconds', ends_at = now() + interval '305 seconds' where id = $1`, [mid]);
    expect(await forfeit(b, mid)).toEqual({ status: "forfeited" });
    expect((await getMatch(a, mid)).me.result).toBe("win");
  });

  test("a second forfeit, or one after the match ended, changes nothing", async () => {
    const { a, b, mid } = await rankedMatch();
    await forfeit(a, mid);
    expect(await forfeit(a, mid)).toEqual({ status: "match_over" });
    expect(await forfeit(b, mid)).toEqual({ status: "match_over" });
    expect((await getMatch(b, mid)).me.result).toBe("win");
    expect(await profile(a)).toMatchObject({ matches_played: 1, losses: 1 });
  });

  test("after time's up the clock decides, not the forfeit", async () => {
    const { a, b, mid } = await rankedMatch();
    await answer(a, mid, "A");
    await startedAgo(db, mid, 301);
    expect(await forfeit(a, mid)).toEqual({ status: "time_up" });
    const m = await getMatch(a, mid);
    expect(m.me.result).toBe("win");
    expect(m.forfeited_by).toBeNull();
    expect(m.resigned).toBe(false);
    expect(await profile(b)).toMatchObject({ losses: 1 });
  });

  test("a disconnect is a forfeit but not resigned", async () => {
    const { a, b, mid } = await rankedMatch();
    await db.query(`update match_players set last_seen = now() - interval '31 seconds' where match_id = $1 and user_id = $2`, [mid, b]);
    expect((await rpc<{ status: string }>(db, a, "claim_forfeit", [mid])).status).toBe("opponent_forfeited");
    const m = await getMatch(a, mid);
    expect(m.forfeited_by).toBe(b);
    expect(m.resigned).toBe(false);
  });

  test("friend duels: unrated; a game nobody joined can't be forfeited", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    const { match_id: mid, code } = await rpc<{ match_id: string; code: string }>(db, a, "create_friend_match");
    expect(await forfeit(a, mid)).toEqual({ status: "not_started" });
    await rpc(db, b, "join_friend_match", [code]);
    expect(await forfeit(a, mid)).toEqual({ status: "forfeited" });
    const m = await getMatch(b, mid);
    expect(m.me.result).toBe("win");
    expect(m.me.elo_after).toBe(m.me.elo_before);
    expect(await profile(b)).toMatchObject({ elo: 900, matches_played: 0 });
  });

  test("recorded run: forfeiting loses to the ghost", async () => {
    const { a, b, mid } = await rankedMatch();
    for (const s of ["A", "B", "C"]) {
      await answer(a, mid, s);
      await answer(b, mid, s, false);
    }
    const carl = await makeUser(db, "carl");
    await rpc(db, carl, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '31 seconds' where user_id = $1`, [carl]);
    const replay = await rpc<string>(db, carl, "join_queue");
    expect((await getMatch(carl, replay)).mode).toBe("async");
    await startedAgo(db, replay, 10);
    expect(await forfeit(carl, replay)).toEqual({ status: "forfeited" });
    const m = await getMatch(carl, replay);
    expect(m.me.result).toBe("loss");
    expect(m.me.elo_after).toBeLessThan(m.me.elo_before);
  });

  test("only players can forfeit", async () => {
    const { mid } = await rankedMatch();
    const eve = await makeUser(db, "eve");
    await expect(forfeit(eve, mid)).rejects.toThrow("not_participant");
  });
});

describe("solve times in get_match", () => {
  test("answered_at on my answers; solved_at only for the opponent's solved slots", async () => {
    const { a, b, mid } = await rankedMatch();
    await answer(a, mid, "A");
    await answer(a, mid, "B", false);
    await answer(b, mid, "C");
    await answer(b, mid, "A", false);
    await db.query(`update submissions set submitted_at = '2026-11-18T12:00:42Z' where match_id = $1 and user_id = $2 and slot = 'C'`, [mid, b]);

    const m = await getMatch(a, mid);
    expect(m.me.answers.map((x) => x.slot)).toEqual(["A", "B"]);
    for (const x of m.me.answers) expect(Number.isNaN(Date.parse(x.answered_at))).toBe(false);
    expect(m.opponent?.solved).toEqual(["C"]);
    expect(Object.keys(m.opponent!.solved_at)).toEqual(["C"]);
    expect(new Date(m.opponent!.solved_at.C).toISOString()).toBe("2026-11-18T12:00:42.000Z");
  });

  test("recorded runs: the ghost's solve times follow the replay clock and stay hidden until reached", async () => {
    const { a, b, mid } = await rankedMatch();
    for (const s of ["A", "B", "C"]) {
      await answer(a, mid, s);
      await answer(b, mid, s);
    }
    // Either player's run may be picked as the ghost: give both the same timings.
    await db.query(`update submissions set ms_from_start = case slot when 'A' then 20000 when 'B' then 90000 else 200000 end where match_id = $1`, [mid]);

    const carl = await makeUser(db, "carl", 900);
    await rpc(db, carl, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '31 seconds' where user_id = $1`, [carl]);
    const replay = await rpc<string>(db, carl, "join_queue");
    await startedAgo(db, replay, 100);

    const m = await getMatch(carl, replay);
    expect(m.opponent?.is_ghost).toBe(true);
    expect(m.opponent?.solved).toEqual(["A", "B"]);
    const start = Date.parse(m.started_at);
    expect(Object.fromEntries(Object.entries(m.opponent!.solved_at).map(([k, v]) => [k, Date.parse(v) - start]))).toEqual({ A: 20000, B: 90000 });
  });

  test("resigned is false on an ordinary finish", async () => {
    const { a, b, mid } = await rankedMatch();
    for (const s of ["A", "B", "C"]) {
      await answer(a, mid, s);
      await answer(b, mid, s);
    }
    const m = await getMatch(a, mid);
    expect(m.status).toBe("finished");
    expect(m.resigned).toBe(false);
    expect(m.forfeited_by).toBeNull();
  });
});

describe("forfeit-pair flags", () => {
  type Flag = { match_id: string; user_id: string; reason: string };
  const pairFlags = async () =>
    (await db.query<Flag>(`select match_id, user_id, reason from flags where reason like 'forfeit_pair:%' order by id`)).rows;

  /** A new ranked duel between two existing players, clock running. */
  async function duel(x: string, y: string) {
    expect(await rpc(db, x, "join_queue")).toBeNull();
    const mid = await rpc<string>(db, y, "join_queue");
    expect(mid).toBeTruthy();
    await startedAgo(db, mid, 60);
    return mid;
  }

  test("one forfeit: no flag", async () => {
    const { a, mid } = await rankedMatch();
    await forfeit(a, mid);
    expect(await pairFlags()).toEqual([]);
  });

  test("second forfeit between the same pair within 24h, either way round: flagged on the forfeiter", async () => {
    const { a, b, mid } = await rankedMatch();
    await forfeit(a, mid);
    const second = await duel(a, b);
    await forfeit(b, second);
    expect(await pairFlags()).toEqual([{ match_id: second, user_id: b, reason: `forfeit_pair:${a}:2` }]);

    const third = await duel(a, b);
    await forfeit(b, third);
    expect((await pairFlags()).map((f) => f.reason)).toEqual([`forfeit_pair:${a}:2`, `forfeit_pair:${a}:3`]);
  });

  test("disconnects count as forfeits", async () => {
    const { a, b, mid } = await rankedMatch();
    await forfeit(a, mid);
    const second = await duel(a, b);
    await db.query(`update match_players set last_seen = now() - interval '31 seconds' where match_id = $1 and user_id = $2`, [second, a]);
    expect((await rpc<{ status: string }>(db, b, "claim_forfeit", [second])).status).toBe("opponent_forfeited");
    expect(await pairFlags()).toEqual([{ match_id: second, user_id: a, reason: `forfeit_pair:${b}:2` }]);
  });

  test("forfeits more than 24h ago don't count", async () => {
    const { a, b, mid } = await rankedMatch();
    await forfeit(a, mid);
    await db.query(`update matches set finished_at = now() - interval '25 hours' where id = $1`, [mid]);
    await forfeit(a, await duel(a, b));
    expect(await pairFlags()).toEqual([]);
  });

  test("other pairs, ordinary finishes and friend duels don't count; the flag changes nothing else", async () => {
    const { a, b, mid } = await rankedMatch();
    const carl = await makeUser(db, "carl");
    await forfeit(a, mid);

    // a vs carl: a different pair
    await forfeit(a, await duel(a, carl));
    // a vs b, played out to the end
    const played = await duel(a, b);
    for (const s of ["A", "B", "C"]) {
      await answer(a, played, s);
      await answer(b, played, s, false);
    }
    // a vs b, friend duel forfeit
    const { match_id: friendly, code } = await rpc<{ match_id: string; code: string }>(db, a, "create_friend_match");
    await rpc(db, b, "join_friend_match", [code]);
    await forfeit(a, friendly);
    expect(await pairFlags()).toEqual([]);

    // The second rated forfeit is flagged, and is otherwise an ordinary forfeit.
    const before = await profile(a);
    const flagged = await duel(a, b);
    await forfeit(a, flagged);
    expect(await pairFlags()).toHaveLength(1);
    const m = await getMatch(a, flagged);
    expect(m).toMatchObject({ status: "finished", forfeited_by: a, resigned: true });
    expect(await profile(a)).toMatchObject({ matches_played: before.matches_played + 1, losses: before.losses + 1 });
  });

  test("the browser can't read flags", async () => {
    await expect(asUser(db, (await rankedMatch()).a, `select * from flags`)).rejects.toThrow(/permission denied/);
  });
});
