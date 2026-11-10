import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, asUser, createDb, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

type Card = { banner: string; accent: number; avatar_path: string | null; wins: number; losses: number; draws: number };
type MatchState = {
  status: string;
  me: Record<string, unknown> & Card;
  opponent: (Record<string, unknown> & Card & { solved: string[]; score: number | null }) | null;
};

const CARD_KEYS = ["accent", "avatar_path", "banner", "draws", "losses", "wins"];

let db: Db;
let a: string;
let b: string;
let mid: string;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db);
  a = await makeUser(db, "alice");
  b = await makeUser(db, "bob");
  await rpc(db, a, "join_queue");
  mid = await rpc<string>(db, b, "join_queue");
  await db.query(`update profiles set banner = 'mountain', accent = 4, avatar_path = $2, wins = 7, losses = 3, draws = 1 where id = $1`, [
    b,
    `${b}/pic.webp`,
  ]);
});

describe("get_match player cards", () => {
  test("both players carry their public banner, accent, picture and record", async () => {
    const m = await rpc<MatchState>(db, a, "get_match", [mid]);
    expect(m.me).toMatchObject({ banner: "grid", accent: 0, avatar_path: null, wins: 0, losses: 0, draws: 0 });
    expect(m.opponent).toMatchObject({ username: "bob", banner: "mountain", accent: 4, avatar_path: `${b}/pic.webp`, wins: 7, losses: 3, draws: 1 });
  });

  test("adds only the card fields: every other key is what get_match returned before", async () => {
    await startedAgo(db, mid, 30);
    const m = await rpc<MatchState>(db, a, "get_match", [mid]);
    // The old body isn't callable from the browser.
    await expect(asUser(db, a, `select private.get_match_base($1)`, [mid])).rejects.toThrow(/permission denied/);

    const before = await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [a]);
      return (await tx.query<{ v: MatchState }>(`select private.get_match_base($1) v`, [mid])).rows[0].v;
    });
    const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !CARD_KEYS.includes(k)));
    const noClock = (o: object) => ({ ...o, server_now: null });
    expect(noClock({ ...m, me: strip(m.me), opponent: strip(m.opponent!) })).toEqual(noClock(before));
    expect(Object.keys(m.me).filter((k) => !(k in before.me)).sort()).toEqual(CARD_KEYS);
    expect(Object.keys(m.opponent!).filter((k) => !(k in before.opponent!)).sort()).toEqual(CARD_KEYS);
  });

  test("never leaks the opponent's answers", async () => {
    await startedAgo(db, mid, 30);
    const right = await answerFor(db, mid, "A");
    await rpc(db, b, "submit_answer", [mid, "A", right]);
    const m = await rpc<MatchState>(db, a, "get_match", [mid]);
    expect(m.opponent?.solved).toEqual(["A"]);
    expect(m.opponent?.score).toBeNull();
    expect(JSON.stringify(m.opponent)).not.toContain(right);
  });

  test("outsiders still can't see the match", async () => {
    const eve = await makeUser(db, "eve");
    await expect(rpc(db, eve, "get_match", [mid])).rejects.toThrow(/not_participant/);
  });

  test("a friend match with no opponent yet has opponent null", async () => {
    const carl = await makeUser(db, "carl");
    const { match_id } = await rpc<{ match_id: string }>(db, carl, "create_friend_match");
    const m = await rpc<MatchState>(db, carl, "get_match", [match_id]);
    expect(m.opponent).toBeNull();
    expect(m.me).toMatchObject({ banner: "grid", wins: 0 });
  });

  test("finish_match returns the cards too", async () => {
    await startedAgo(db, mid, 400); // past the 5-minute clock
    const m = await rpc<MatchState>(db, a, "finish_match", [mid]);
    expect(m.status).toBe("finished");
    expect(m.opponent).toMatchObject({ banner: "mountain", accent: 4 });
  });
});
