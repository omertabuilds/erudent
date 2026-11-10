import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { asUser, createDb, makeUser, rpc, type Db } from "./harness";

let db: Db;
let me: string;
let other: string;

beforeEach(async () => {
  db = await createDb();
  me = await makeUser(db, "eliam");
  other = await makeUser(db, "chris");
});

type Style = { banner: string; accent: number; tagline: string | null };
const style = (uid: string, banner: string, accent: number, tagline: string | null) =>
  rpc<Style>(db, uid, "update_profile_style", [banner, accent, tagline]);
const myPlayer = async (uid: string) =>
  (await asUser<Style & { avatar_path: string | null }>(db, uid, `select * from public.my_player()`))[0];

/** Upload a file as `uid`, through the storage policies. */
const upload = (uid: string, name: string) =>
  asUser(db, uid, `insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)`, [name, uid]);

describe("profile style", () => {
  test("defaults: grid banner, rank accent, no tagline, no picture", async () => {
    expect(await myPlayer(me)).toMatchObject({ banner: "grid", accent: 0, tagline: null, avatar_path: null });
  });

  test("saves banner, accent and tagline to your own row only", async () => {
    expect(await style(me, "mountain", 3, "Proofs before breakfast")).toEqual({
      banner: "mountain",
      accent: 3,
      tagline: "Proofs before breakfast",
    });
    expect(await myPlayer(me)).toMatchObject({ banner: "mountain", accent: 3, tagline: "Proofs before breakfast" });
    expect(await myPlayer(other)).toMatchObject({ banner: "grid", accent: 0, tagline: null });
  });

  test("trims and folds whitespace; empty means no tagline", async () => {
    expect((await style(me, "grid", 0, "  two   spaces\n\tand a tab  ")).tagline).toBe("two spaces and a tab");
    expect((await style(me, "grid", 0, "   ")).tagline).toBeNull();
    expect((await style(me, "grid", 0, null)).tagline).toBeNull();
  });

  test("60 characters fit, 61 don't", async () => {
    expect((await style(me, "solid", 6, "a".repeat(60))).tagline).toHaveLength(60);
    await expect(style(me, "solid", 6, "a".repeat(61))).rejects.toThrow("tagline_length");
  });

  test("rejects unknown banners and accents", async () => {
    await expect(style(me, "plaid", 0, null)).rejects.toThrow("invalid_banner");
    await expect(style(me, "grid", 7, null)).rejects.toThrow("invalid_accent");
    await expect(style(me, "grid", -1, null)).rejects.toThrow("invalid_accent");
  });

  test.each([
    "what the fuck",
    "f.u.c.k proofs",
    "Sh1t happens",
    "fully a55",
    "ball gag",
    "math is FuCkInG hard",
  ])("blocks %j", async (t) => {
    await expect(style(me, "grid", 0, t)).rejects.toThrow("tagline_not_allowed");
  });

  test.each([
    "First in my class",
    "Analysis, then lunch",
    "Future therapist",
    "Football gaga",
    "Scunthorpe's finest",
    "Erudent since day one",
    "Sussex · Cumulants",
  ])("allows %j", async (t) => {
    expect((await style(me, "grid", 0, t)).tagline).toBe(t);
  });

  test("needs a signed-in player with a profile", async () => {
    await expect(asUser(db, null, `select public.update_profile_style('grid', 0, null)`)).rejects.toThrow();
    const noProfile = randomUUID();
    await db.query(`insert into auth.users (id) values ($1)`, [noProfile]);
    await expect(style(noProfile, "grid", 0, null)).rejects.toThrow("no_profile");
  });

  test("the browser still can't write profiles directly", async () => {
    await expect(asUser(db, me, `update public.profiles set banner = 'solid' where id = $1`, [me])).rejects.toThrow();
  });
});

describe("avatars", () => {
  test("the bucket is public, 2 MB, images only", async () => {
    const res = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`);
    expect(res.rows[0]).toEqual({ public: true, file_size_limit: 2097152, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] });
  });

  test("you can upload only into your own folder", async () => {
    await upload(me, `${me}/avatar-1.webp`);
    await expect(upload(me, `${other}/avatar-1.webp`)).rejects.toThrow();
    await expect(upload(me, `avatar-1.webp`)).rejects.toThrow();
  });

  test("you can't see, replace or delete someone else's files", async () => {
    await upload(other, `${other}/avatar-1.webp`);
    expect(await asUser(db, me, `select name from storage.objects`)).toEqual([]);
    expect(await asUser(db, me, `update storage.objects set name = name || 'x' returning name`)).toEqual([]);
    expect(await asUser(db, me, `delete from storage.objects returning name`)).toEqual([]);
    expect(await asUser(db, other, `delete from storage.objects returning name`)).toEqual([{ name: `${other}/avatar-1.webp` }]);
  });

  test("set_avatar points at your own uploaded file, or clears it", async () => {
    const path = `${me}/avatar-1.webp`;
    await upload(me, path);
    expect(await rpc(db, me, "set_avatar", [path])).toBe(path);
    expect((await myPlayer(me)).avatar_path).toBe(path);
    expect(await rpc(db, me, "set_avatar", [null])).toBeNull();
    expect((await myPlayer(me)).avatar_path).toBeNull();
  });

  test("set_avatar rejects other folders, odd paths and missing files", async () => {
    await upload(other, `${other}/avatar-1.webp`);
    await expect(rpc(db, me, "set_avatar", [`${other}/avatar-1.webp`])).rejects.toThrow("avatar_path_invalid");
    await expect(rpc(db, me, "set_avatar", [`${me}/../${other}/avatar-1.webp`])).rejects.toThrow("avatar_path_invalid");
    await expect(rpc(db, me, "set_avatar", [`${me}/sub/avatar.webp`])).rejects.toThrow("avatar_path_invalid");
    await expect(rpc(db, me, "set_avatar", [`https://example.com/x.png`])).rejects.toThrow("avatar_path_invalid");
    await expect(rpc(db, me, "set_avatar", [`${me}/avatar-2.webp`])).rejects.toThrow("avatar_missing");
  });
});
