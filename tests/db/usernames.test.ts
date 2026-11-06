import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { asUser, createDb, makeUser, rpc, seedQuestions, type Db } from "./harness";
import { localUsernameProblem, usernameKey } from "../../src/lib/username";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

const WORDLISTS = join(__dirname, "../../supabase/wordlists");
const lines = (file: string) =>
  [...new Set(readFileSync(join(WORDLISTS, file), "utf8").split("\n").filter((l) => l !== ""))].sort();

async function problem(name: string) {
  const res = await db.query<{ p: string | null }>(`select private.username_problem($1) as p`, [name]);
  return res.rows[0].p;
}

async function signedIn() {
  const id = randomUUID();
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  return id;
}

const create = (uid: string, name: string) => rpc(db, uid, "create_profile", [name, "2000-01-01"]);

// [name, what the database says, what the browser says if different]. The browser
// doesn't know the wordlist or the allow list, so it can't catch those or reserved names inside a name.
const CASES: [string, string | null, (string | null)?][] = [
  ["abc", null],
  ["Eliam", null],
  ["Euler.fan", null],
  ["x-y_z.9", null],
  ["eliam_", null],
  ["M4th.Wiz", null],
  ["ggez", null],
  ["ab", "username_length"],
  ["a".repeat(21), "username_length"],
  ["has space", "username_chars"],
  ["émile", "username_chars"],
  ["Ｅliam", "username_chars"], // fullwidth E
  ["аdmin", "username_chars"], // Cyrillic а
  ["abc😀", "username_chars"],
  ["eli!am", "username_chars"],
  ["_eliam", "username_start"],
  [".eli", "username_start"],
  ["-eli", "username_start"],
  ["eli__am", "username_symbols"],
  ["eli.-am", "username_symbols"],
  ["Admin", "username_reserved"],
  ["ADM1N", "username_reserved"],
  ["a.d.m.i.n", "username_reserved"],
  ["Erudent", "username_reserved"],
  ["0merta", "username_reserved"],
  ["Mod", "username_reserved"],
  ["null", "username_reserved"],
  ["undefined", "username_reserved"],
  ["Moderat0r", "username_reserved"],
  ["the_moderator", "username_reserved"],
  ["eliam_admin", "username_reserved", null],
  ["ErudentFan", "username_reserved", null],
  ["0merta.real", "username_reserved", null],
  ["Staff.Eliam", "username_reserved", null],
  ["m0d_eliam", "username_reserved", null],
  ["mod_eliam", "username_reserved", null],
  ["ModEliam", "username_reserved", null],
  ["admin.istrator", "username_reserved", null],
  ["eliam.mod", "username_reserved", null],
  ["supporter", "username_reserved", null],
  ["unofficial", "username_reserved", null],
  // Innocent overlaps with reserved names, rescued by the allow list.
  ["Model.Maker", null],
  ["modern.art", null],
  ["Modulo_Fan", null],
  ["commodity", null],
  ["badminton", null],
  ["Flagstaff", null],
  ["Stafford", null],
  ["MathModel", null],
  ["fuck", "username_blocked"],
  ["FuCk_you", "username_blocked"],
  ["f.u.c.k", "username_blocked"],
  ["sh1t_head", "username_blocked"],
  ["5h1t", "username_blocked"],
  ["a55", "username_blocked"],
  ["xxx", "username_blocked"],
  ["2g1c", "username_blocked"],
  ["n1gg3r", "username_blocked"],
  ["sexy_sam", "username_blocked"],
  ["analysis.fuck", "username_blocked"],
  ["grapeanal", "username_blocked"],
  // Short blocked words only match the whole name; allowed words are masked out.
  ["class", null],
  ["Sussex", null],
  ["Cumulant", null],
  ["Analysis_Fan", null],
  ["Peacock", null],
  ["grapes", null],
  ["therapist", null],
  ["Scunthorpe", null],
  ["button_mash", null],
  ["among_us", null],
  ["Montenegro", null],
  ["basement", null],
  ["Heraclitus", null],
  ["Emily.Dickinson", null],
  ["specialist", null],
];

describe("rules", () => {
  test.each(CASES)("%s → %s", async (name, expected, browser) => {
    expect(await problem(name)).toBe(expected);
    const inBrowser = browser !== undefined ? browser : expected === "username_blocked" ? null : expected;
    expect(localUsernameProblem(name)).toBe(inBrowser);
  });

  test("the browser and the database normalize the same way", async () => {
    for (const name of ["M4th.Wiz_0", "Sh1t-Head", "@ss", "Ab-C.d_E"]) {
      const res = await db.query<{ k: string }>(`select private.username_key($1) as k`, [name]);
      expect(res.rows[0].k).toBe(usernameKey(name));
    }
  });

  test("the seeded wordlists match the files", async () => {
    const blocked = await db.query<{ entry: string }>(`select entry from private.blocked_words order by entry`);
    expect(blocked.rows.map((r) => r.entry).sort()).toEqual(lines("en.txt"));
    const allowed = await db.query<{ word: string }>(`select word from private.allowed_words order by word`);
    expect(allowed.rows.map((r) => r.word).sort()).toEqual(lines("allow.txt"));
  });

  test("every blocked word that could be a name is caught", async () => {
    const res = await db.query<{ word: string; p: string | null }>(`
      select word, private.username_problem(word) as p from private.blocked_words
       where length(word) between 3 and 20`);
    expect(res.rows.length).toBeGreaterThan(300);
    expect(res.rows.filter((r) => r.p !== "username_blocked")).toEqual([]);
  });

  test("every allowed word is a fine name on its own", async () => {
    const res = await db.query<{ word: string; p: string | null }>(`
      select word, private.username_problem(word) as p from private.allowed_words
       where length(word) between 3 and 20`);
    expect(res.rows.filter((r) => r.p !== null)).toEqual([]);
  });
});

describe("create_profile", () => {
  test("keeps the case as typed, trims, and is unique ignoring case", async () => {
    await create(await signedIn(), "  Eliam ");
    const other = await signedIn();
    await expect(create(other, "eliam")).rejects.toThrow("username_taken");
    await expect(create(other, "ELIAM")).rejects.toThrow("username_taken");
    const res = await db.query<{ username: string }>(`select username from profiles`);
    expect(res.rows).toEqual([{ username: "Eliam" }]);
  });

  test("says which rule a name breaks", async () => {
    const uid = await signedIn();
    for (const [name, code] of CASES) if (code) await expect(create(uid, name)).rejects.toThrow(code);
  });

  test("the rules hold for writes that skip create_profile", async () => {
    const uid = await makeUser(db, "Eliam");
    await expect(db.query(`update profiles set username = 'fuck' where id = $1`, [uid])).rejects.toThrow("username_blocked");
    await expect(db.query(`update profiles set username = '_x_' where id = $1`, [uid])).rejects.toThrow("username_start");
    const id = await signedIn();
    // Two signups racing past the check still collide, and it reads as taken.
    await expect(db.query(`insert into profiles (id, username) values ($1, 'ELIAM')`, [id])).rejects.toThrow("username_taken");
  });
});

describe("check_username", () => {
  test("null when free, the reason when not; your own name counts as free", async () => {
    const eliam = await makeUser(db, "Eliam");
    const uid = await signedIn();
    expect(await rpc(db, uid, "check_username", ["Euler.fan"])).toBeNull();
    expect(await rpc(db, uid, "check_username", ["eliam"])).toBe("username_taken");
    expect(await rpc(db, uid, "check_username", ["f.u.c.k"])).toBe("username_blocked");
    expect(await rpc(db, uid, "check_username", ["eli__am"])).toBe("username_symbols");
    expect(await rpc(db, eliam, "check_username", ["ELIAM"])).toBeNull();
  });

  test("needs sign-in and is rate limited per account", async () => {
    await expect(asUser(db, null, `select public.check_username('Euler')`)).rejects.toThrow(/permission denied/);
    const uid = await signedIn();
    for (let i = 0; i < 120; i++) expect(await rpc(db, uid, "check_username", [`name${i}`])).toBeNull();
    expect(await rpc(db, uid, "check_username", ["name_x"])).toBe("rate_limited");
    expect(await rpc(db, uid, "check_username", ["name_y"])).toBe("rate_limited");
    expect(await rpc(db, await signedIn(), "check_username", ["name_z"])).toBeNull();
  });
});

describe("forced rename", () => {
  test("names that break the rules when the migration runs are flagged, not rejected", async () => {
    // All allowed by the old rules (^[a-z0-9_]{3,20}$).
    const legacy = ["_lead", "a__b", "admin", "xxx", "ggez", "euler_fan"];
    const ids: Record<string, string> = {};
    db = await createDb({
      "20261106025646_username_rules.sql": async (pg) => {
        for (const name of legacy) {
          const id = randomUUID();
          ids[name] = id;
          await pg.query(`insert into auth.users (id) values ($1)`, [id]);
          await pg.query(`insert into profiles (id, username) values ($1, $2)`, [id, name]);
        }
        await pg.query(`insert into queue (user_id, elo) values ($1, 900), ($2, 900)`, [ids.xxx, ids.ggez]);
      },
    });
    const res = await db.query<{ username: string; needs_rename: boolean }>(
      `select username, exists (select 1 from private.username_flags f where f.user_id = p.id) as needs_rename
         from profiles p order by username`,
    );
    expect(Object.fromEntries(res.rows.map((r) => [r.username, r.needs_rename]))).toEqual({
      _lead: true,
      a__b: true,
      admin: true,
      xxx: true,
      ggez: false,
      euler_fan: false,
    });
    const queue = await db.query<{ user_id: string }>(`select user_id from queue`);
    expect(queue.rows).toEqual([{ user_id: ids.ggez }]);
  });

  test("a flagged player can't queue or play until they rename; then everything works", async () => {
    await seedQuestions(db);
    const host = await makeUser(db, "host");
    const { code } = await rpc<{ code: string }>(db, host, "create_friend_match");
    const uid = await makeUser(db, "oldname", 1234, 12);
    await db.query(`insert into private.username_flags (user_id) values ($1)`, [uid]);

    await expect(rpc(db, uid, "join_queue")).rejects.toThrow("needs_rename");
    await expect(rpc(db, uid, "create_friend_match")).rejects.toThrow("needs_rename");
    await expect(rpc(db, uid, "join_friend_match", [code])).rejects.toThrow("needs_rename");

    await expect(rpc(db, uid, "rename_username", ["f.u.c.k"])).rejects.toThrow("username_blocked");
    await expect(rpc(db, uid, "rename_username", ["HOST"])).rejects.toThrow("username_taken");
    await rpc(db, uid, "rename_username", ["New.Name"]);

    expect(await asUser(db, uid, `select username, elo, matches_played, needs_rename from public.my_player()`)).toEqual([
      { username: "New.Name", elo: 1234, matches_played: 12, needs_rename: false },
    ]);
    expect(await rpc(db, uid, "join_friend_match", [code])).toBeTruthy();
    await expect(rpc(db, uid, "rename_username", ["Another"])).rejects.toThrow("rename_not_needed");
  });

  test("only the player can see their own flag", async () => {
    const flagged = await makeUser(db, "oldname");
    const other = await makeUser(db, "other");
    await db.query(`insert into private.username_flags (user_id) values ($1)`, [flagged]);

    expect(await asUser(db, flagged, `select username, needs_rename from public.my_player()`)).toEqual([
      { username: "oldname", needs_rename: true },
    ]);
    // Everyone else: no flag on profiles, no way into the table, my_player is only ever about you.
    for (const uid of [other, null]) {
      const rows = await asUser<Record<string, unknown>>(db, uid, `select * from profiles`);
      expect(rows).toHaveLength(2);
      for (const r of rows) expect(Object.keys(r)).not.toContain("needs_rename");
      await expect(asUser(db, uid, `select * from private.username_flags`)).rejects.toThrow(/permission denied/);
    }
    expect(await asUser(db, other, `select username, needs_rename from public.my_player()`)).toEqual([
      { username: "other", needs_rename: false },
    ]);
    expect(await asUser(db, await signedIn(), `select * from public.my_player()`)).toEqual([]);
    await expect(asUser(db, null, `select * from public.my_player()`)).rejects.toThrow(/permission denied/);
  });

  test("rename needs sign-in and a profile", async () => {
    await expect(asUser(db, null, `select public.rename_username('Euler')`)).rejects.toThrow(/permission denied/);
    await expect(rpc(db, await signedIn(), "rename_username", ["Euler"])).rejects.toThrow("no_profile");
  });
});

describe("profile page data", () => {
  /** A finished match between two players, `daysAgo` days ago. */
  async function duel(a: string, b: string, opts: { mode?: string; daysAgo?: number; status?: string; ghost?: boolean } = {}) {
    const { mode = "ranked", daysAgo = 0, status = "finished", ghost = false } = opts;
    const res = await db.query<{ id: string }>(
      `insert into matches (mode, status, finished_at) values ($1, $2, now() - make_interval(days => $3)) returning id`,
      [mode, status, daysAgo],
    );
    const id = res.rows[0].id;
    await db.query(
      `insert into match_players (match_id, user_id, elo_before, elo_after, score, result, is_ghost)
       values ($1, $2, 900, 912, 3, 'win', false), ($1, $3, 900, 888, 1, 'loss', $4)`,
      [id, a, b, ghost],
    );
    return id;
  }

  test("get_profile finds a player in any case, signed out", async () => {
    await makeUser(db, "Euler.Fan", 1100, 14);
    const rows = await asUser(db, null, `select * from public.get_profile('euler.fan')`);
    expect(rows).toEqual([
      expect.objectContaining({ username: "Euler.Fan", elo: 1100, rank: "Savant", matches_played: 14 }),
    ]);
    expect(await asUser(db, null, `select * from public.get_profile('nobody')`)).toEqual([]);
  });

  test("recent duels: finished only, newest first, at most 10, any case, never as the ghost", async () => {
    const a = await makeUser(db, "Ada");
    const b = await makeUser(db, "Bob");
    const newest = await duel(a, b, { daysAgo: 0 });
    for (let d = 1; d <= 11; d++) await duel(a, b, { daysAgo: d });
    await duel(a, b, { status: "active", daysAgo: -1 });

    const rows = await asUser<{ match_id: string; opponent: string; result: string; finished_at: string }>(
      db, null, `select * from public.get_recent_matches('ADA')`,
    );
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ match_id: newest, opponent: "Bob", result: "win" });
    const times = rows.map((r) => new Date(r.finished_at).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);

    // Bob's runs replayed as a ghost aren't Bob's duels.
    const c = await makeUser(db, "Cara");
    await duel(c, b, { mode: "async", ghost: true });
    const bob = await asUser<{ opponent: string }>(db, null, `select * from public.get_recent_matches('bob')`);
    expect(bob.map((r) => r.opponent)).not.toContain("Cara");
  });

  test("the wordlists stay private", async () => {
    const uid = await signedIn();
    await expect(asUser(db, uid, `select * from private.blocked_words`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, uid, `select private.username_problem('x')`)).rejects.toThrow(/permission denied/);
  });
});
