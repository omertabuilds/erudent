import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, createDb, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

// get_match's opponent.last_seen: what the duel screen's "Opponent disconnected" countdown runs from.
// It must match what claim_forfeit counts its 30 seconds from.

type MatchState = {
  mode: string;
  started_at: string;
  opponent: { is_ghost: boolean; last_seen: string | null } | null;
};

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db);
});

const getMatch = (uid: string, mid: string) => rpc<MatchState>(db, uid, "get_match", [mid]);
const setLastSeen = (mid: string, uid: string, secondsAgo: number) =>
  db.query(`update match_players set last_seen = now() - make_interval(secs => $3) where match_id = $1 and user_id = $2`, [mid, uid, secondsAgo]);
const serverNow = async () => Number((await db.query<{ t: string }>(`select extract(epoch from now()) * 1000 as t`)).rows[0].t);

async function rankedMatch() {
  const a = await makeUser(db, "alice");
  const b = await makeUser(db, "bob");
  await rpc(db, a, "join_queue");
  const mid = await rpc<string>(db, b, "join_queue");
  await startedAgo(db, mid, 60);
  return { a, b, mid };
}

describe("opponent.last_seen", () => {
  test("is the opponent's last heartbeat, and moves when they beat again", async () => {
    const { a, b, mid } = await rankedMatch();
    await setLastSeen(mid, b, 12);
    const silent = (await serverNow()) - Date.parse((await getMatch(a, mid)).opponent!.last_seen!);
    expect(silent).toBeGreaterThanOrEqual(12_000);
    expect(silent).toBeLessThan(13_000);

    await rpc(db, b, "heartbeat", [mid]);
    const after = (await serverNow()) - Date.parse((await getMatch(a, mid)).opponent!.last_seen!);
    expect(after).toBeLessThan(1_000);
  });

  test("never earlier than the match start (a friend host waiting in the lobby isn't 'gone')", async () => {
    const { a, b, mid } = await rankedMatch();
    await setLastSeen(mid, b, 600);
    const m = await getMatch(a, mid);
    expect(m.opponent!.last_seen).toBe(m.started_at);
  });

  test("agrees with claim_forfeit: 29s silent is connected, 31s is a forfeit", async () => {
    const { a, b, mid } = await rankedMatch();
    await setLastSeen(mid, b, 29);
    expect((await rpc<{ status: string }>(db, a, "claim_forfeit", [mid])).status).toBe("opponent_connected");
    await setLastSeen(mid, b, 31);
    expect((await rpc<{ status: string }>(db, a, "claim_forfeit", [mid])).status).toBe("opponent_forfeited");
  });

  test("null in a recorded run", async () => {
    const { a, b, mid } = await rankedMatch();
    for (const s of ["A", "B", "C"]) {
      const ans = await answerFor(db, mid, s);
      await rpc(db, a, "submit_answer", [mid, s, ans]);
      await rpc(db, b, "submit_answer", [mid, s, ans]);
    }
    const carl = await makeUser(db, "carl");
    await rpc(db, carl, "join_queue");
    await db.query(`update queue set joined_at = now() - interval '31 seconds' where user_id = $1`, [carl]);
    const replay = await rpc<string>(db, carl, "join_queue");
    const m = await getMatch(carl, replay);
    expect(m.mode).toBe("async");
    expect(m.opponent!.is_ghost).toBe(true);
    expect(m.opponent!.last_seen).toBeNull();
  });

  test("no opponent yet: no opponent object at all", async () => {
    const a = await makeUser(db, "alice");
    const { match_id: mid } = await rpc<{ match_id: string }>(db, a, "create_friend_match");
    expect((await getMatch(a, mid)).opponent).toBeNull();
  });
});
