import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, asUser, createDb, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

// private.sweep_abandoned_matches: the every-minute pg_cron job that settles duels both players walked away from.

type MatchState = {
  status: string;
  forfeited_by: string | null;
  me: { result: string | null; elo_before: number; elo_after: number | null };
  opponent: { result: string | null; elo_after: number | null } | null;
};

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db);
});

const sweep = async () => (await db.query<{ n: number }>(`select private.sweep_abandoned_matches() as n`)).rows[0].n;
const getMatch = (uid: string, mid: string) => rpc<MatchState>(db, uid, "get_match", [mid]);
const profile = async (uid: string) =>
  (await db.query<{ elo: number; matches_played: number }>(`select elo, matches_played from profiles where id = $1`, [uid])).rows[0];

async function rankedMatch(names = ["alice", "bob"]) {
  const a = await makeUser(db, names[0]);
  const b = await makeUser(db, names[1]);
  await rpc(db, a, "join_queue");
  const mid = await rpc<string>(db, b, "join_queue");
  await startedAgo(db, mid, 60);
  return { a, b, mid };
}

async function answer(uid: string, mid: string, slot: string, right = true) {
  const ans = await answerFor(db, mid, slot);
  return rpc(db, uid, "submit_answer", [mid, slot, right ? ans : String(Number(ans) + 1)]);
}

/** Both players gone: the 5 minutes ran out a while ago and nobody called in. */
const expire = (mid: string) => startedAgo(db, mid, 6 * 60);

describe("sweep_abandoned_matches", () => {
  test("is registered with pg_cron to run every minute", async () => {
    const { rows } = await db.query(`select schedule, command from cron.job where jobname = 'sweep-abandoned-matches'`);
    expect(rows).toEqual([{ schedule: "* * * * *", command: "select private.sweep_abandoned_matches()" }]);
  });

  test("both left after answering: scored as at time-up, Elo applied", async () => {
    const { a, b, mid } = await rankedMatch();
    await answer(a, mid, "A");
    await answer(b, mid, "A", false);
    await expire(mid);
    expect((await getMatch(a, mid)).status).toBe("active"); // the bug: stuck past 5:00

    expect(await sweep()).toBe(1);
    const m = await getMatch(a, mid);
    expect(m.status).toBe("finished");
    expect(m.forfeited_by).toBeNull();
    expect(m.me.result).toBe("win");
    expect(m.opponent?.result).toBe("loss");
    expect(m.me.elo_after).toBe(940); // equal Elo, placement K = 80
    expect(m.opponent?.elo_after).toBe(860);
    expect(await profile(a)).toEqual({ elo: 940, matches_played: 1 });
    expect(await profile(b)).toEqual({ elo: 860, matches_played: 1 });
  });

  test("one answer from one player is enough to score it", async () => {
    const { a, b, mid } = await rankedMatch();
    await answer(b, mid, "C", false);
    await expire(mid);
    await sweep();
    const m = await getMatch(a, mid);
    expect(m.status).toBe("finished");
    expect(m.me.result).toBe("draw");
  });

  test("both left with no answers: void, no result, no Elo change, not counted as played", async () => {
    const { a, b, mid } = await rankedMatch();
    await expire(mid);

    expect(await sweep()).toBe(1);
    const m = await getMatch(a, mid);
    expect(m.status).toBe("void");
    expect(m.me.result).toBeNull();
    expect(m.opponent?.result).toBeNull();
    expect(m.me.elo_after).toBe(m.me.elo_before);
    expect(m.opponent?.elo_after).toBe(900);
    expect(await profile(a)).toEqual({ elo: 900, matches_played: 0 });
    expect(await profile(b)).toEqual({ elo: 900, matches_played: 0 });
    const seen = await db.query(`select 1 from seen_questions where user_id in ($1, $2)`, [a, b]);
    expect(seen.rows).toHaveLength(0);
    // Neither shows up in recent duels.
    expect(await asUser(db, a, `select * from public.get_recent_matches('alice')`)).toEqual([]);
  });

  test("friend duel with no answers: void too", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    const { match_id, code } = await rpc<{ match_id: string; code: string }>(db, a, "create_friend_match");
    await rpc(db, b, "join_friend_match", [code]);
    await expire(match_id);
    await sweep();
    expect((await getMatch(a, match_id)).status).toBe("void");
  });

  test("a player who returns after time-up, before the sweeper runs, gets void too, not a 0–0 draw", async () => {
    const { a, b, mid } = await rankedMatch();
    await expire(mid);
    // The client's clock-check on reopening the duel.
    const m = await rpc<MatchState>(db, a, "finish_match", [mid]);
    expect(m.status).toBe("void");
    expect(m.me.result).toBeNull();
    expect(m.me.elo_after).toBe(m.me.elo_before);
    expect(await profile(a)).toEqual({ elo: 900, matches_played: 0 });
    expect(await profile(b)).toEqual({ elo: 900, matches_played: 0 });
    expect(await sweep()).toBe(0);
  });

  test("join_queue's clean-up of an old duel voids it the same way", async () => {
    const { a, mid } = await rankedMatch();
    await expire(mid);
    await rpc(db, a, "join_queue");
    expect((await getMatch(a, mid)).status).toBe("void");
  });

  test("a forfeit with no answers is still a loss, not void", async () => {
    const { a, b, mid } = await rankedMatch();
    expect(await rpc(db, a, "forfeit_match", [mid])).toEqual({ status: "forfeited" });
    const m = await getMatch(b, mid);
    expect(m.status).toBe("finished");
    expect(m.me.result).toBe("win");
    expect(await profile(a)).toEqual({ elo: 860, matches_played: 1 });
  });

  test("a recorded run with no answers is scored, never void", async () => {
    const { a, b, mid } = await rankedMatch();
    for (const s of ["A", "B", "C"]) {
      await answer(a, mid, s);
      await answer(b, mid, s);
    }
    const carl = await makeUser(db, "carl");
    await rpc(db, carl, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '31 seconds' where user_id = $1`, [carl]);
    const replay = await rpc<string>(db, carl, "join_queue");
    await expire(replay);
    await sweep();
    const m = await getMatch(carl, replay);
    expect(m.status).toBe("finished");
    expect(m.me.result).toBe("loss");
    expect(m.me.elo_after).toBeLessThan(m.me.elo_before);
  });

  test("re-running is a no-op: nothing settled twice, Elo applied once", async () => {
    const one = await rankedMatch(["alice", "bob"]);
    const two = await rankedMatch(["carl", "dana"]);
    await answer(one.a, one.mid, "A");
    await expire(one.mid);
    await expire(two.mid);

    expect(await sweep()).toBe(2);
    const after = { a: await profile(one.a), b: await profile(one.b), c: await profile(two.a) };
    const statuses = await db.query(`select id, status, finished_at from matches order by id`);

    expect(await sweep()).toBe(0);
    expect(await sweep()).toBe(0);
    expect({ a: await profile(one.a), b: await profile(one.b), c: await profile(two.a) }).toEqual(after);
    expect((await db.query(`select id, status, finished_at from matches order by id`)).rows).toEqual(statuses.rows);
  });

  test("leaves matches still in play, waiting, or already over alone", async () => {
    const live = await rankedMatch(["alice", "bob"]); // 4 minutes left
    const done = await rankedMatch(["carl", "dana"]);
    await rpc(db, done.a, "forfeit_match", [done.mid]);
    await expire(done.mid);
    const host = await makeUser(db, "erin");
    await rpc(db, host, "create_friend_match"); // nobody joined

    expect(await sweep()).toBe(0);
    expect((await getMatch(live.a, live.mid)).status).toBe("active");
    expect((await getMatch(done.a, done.mid)).me.result).toBe("loss");
  });

  test("the browser can't run it", async () => {
    const a = await makeUser(db, "alice");
    await expect(rpc(db, a, "sweep_abandoned_matches")).rejects.toThrow();
    await expect(asUser(db, a, `select private.sweep_abandoned_matches()`)).rejects.toThrow(/permission denied/);
  });
});
