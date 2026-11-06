import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, createDb, grantAccess, makeUser, rpc, seedQuestions, startedAgo, type Db } from "./harness";

// Playing needs a redeemed invitation code, enforced in the database whatever the app does.

let db: Db;

beforeEach(async () => {
  db = await createDb();
  await seedQuestions(db);
});

const noCode = (name: string) => makeUser(db, name, 900, 0, false);

describe("without a redeemed code", () => {
  test("can't join the ranked queue", async () => {
    const uid = await noCode("nocode");
    await expect(rpc(db, uid, "join_queue")).rejects.toThrow("no_access");
    const q = await db.query(`select 1 from queue`);
    expect(q.rows).toHaveLength(0);
  });

  test("can't create a friend match", async () => {
    const uid = await noCode("nocode");
    await expect(rpc(db, uid, "create_friend_match")).rejects.toThrow("no_access");
    expect((await db.query(`select 1 from matches`)).rows).toHaveLength(0);
  });

  test("can't join a friend's match", async () => {
    const host = await makeUser(db, "host");
    const { code } = await rpc<{ code: string }>(db, host, "create_friend_match");
    const uid = await noCode("nocode");
    await expect(rpc(db, uid, "join_friend_match", [code])).rejects.toThrow("no_access");
  });

  test("can't be put into any match, by any route", async () => {
    const uid = await noCode("nocode");
    const m = await db.query<{ id: string }>(`insert into matches (mode, status) values ('ranked', 'active') returning id`);
    await expect(
      db.query(`insert into match_players (match_id, user_id, elo_before) values ($1, $2, 900)`, [m.rows[0].id, uid]),
    ).rejects.toThrow("no_access");
  });

  test("can't submit answers, even in a match they were already in", async () => {
    const a = await makeUser(db, "alice");
    const b = await makeUser(db, "bob");
    expect(await rpc(db, a, "join_queue")).toBeNull();
    const mid = await rpc<string>(db, b, "join_queue");
    await startedAgo(db, mid, 30);
    await db.query(`delete from access_codes where redeemed_by = $1`, [a]); // access taken away mid-match
    await expect(rpc(db, a, "submit_answer", [mid, "A", await answerFor(db, mid, "A")])).rejects.toThrow("no_access");
    expect((await rpc<{ status: string }>(db, b, "submit_answer", [mid, "A", "1"])).status).toBe("ok");
  });

  test("a missing code is reported before a flagged name", async () => {
    const uid = await noCode("oldname");
    await db.query(`insert into private.username_flags (user_id) values ($1)`, [uid]);
    await expect(rpc(db, uid, "join_queue")).rejects.toThrow("no_access");
    await expect(rpc(db, uid, "create_friend_match")).rejects.toThrow("no_access");
  });
});

describe("with a code", () => {
  test("redeeming one unlocks play", async () => {
    const uid = await noCode("latecomer");
    await expect(rpc(db, uid, "join_queue")).rejects.toThrow("no_access");
    const [code] = (await db.query<{ c: string }>(`select private.create_access_codes(1, 'test') as c`)).rows.map((r) => r.c);
    expect(await rpc(db, uid, "redeem_access_code", [code])).toBe(true);
    expect(await rpc(db, uid, "join_queue")).toBeNull();
  });

  test("a recorded run of a player without a code still replays", async () => {
    const uid = await noCode("ghostly");
    const m = await db.query<{ id: string }>(`insert into matches (mode, status) values ('async', 'active') returning id`);
    await db.query(`insert into match_players (match_id, user_id, elo_before, is_ghost) values ($1, $2, 900, true)`, [
      m.rows[0].id,
      uid,
    ]);
  });
});

test("the migration drops queued players who have no code", async () => {
  const ids: Record<string, string> = {};
  const fresh = await createDb({
    "20261106102213_has_access.sql": async (pg) => {
      for (const name of ["with_code", "without"]) {
        const id = randomUUID();
        ids[name] = id;
        await pg.query(`insert into auth.users (id) values ($1)`, [id]);
        await pg.query(`insert into profiles (id, username) values ($1, $2)`, [id, name]);
        await pg.query(`insert into queue (user_id, elo) values ($1, 900)`, [id]);
      }
      await grantAccess(pg, ids.with_code);
    },
  });
  const q = await fresh.query<{ user_id: string }>(`select user_id from queue`);
  expect(q.rows).toEqual([{ user_id: ids.with_code }]);
});
