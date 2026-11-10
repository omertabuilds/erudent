import { beforeEach, describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeAvatar, storeAvatar, sweepAvatarFolder } from "@/lib/avatar";

// The browser side of profile pictures: upload → set_avatar → sweep the folder.
// Storage and the RPCs are stand-ins; the database rules are tested in tests/db/profile_style.

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

let files: Set<string>;
let avatarPath: string | null;
let listFails: boolean;
let listCalls: string[];

const sb = {
  rpc: async (fn: string, args?: { p_path?: string | null }) => {
    if (fn === "my_player") return { data: [{ id: ME, avatar_path: avatarPath }], error: null };
    if (fn === "set_avatar") {
      const p = args?.p_path ?? null;
      if (p !== null && !files.has(p)) return { data: null, error: { message: "avatar_missing" } };
      avatarPath = p;
      return { data: p, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  },
  storage: {
    from: () => ({
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${p}` } }),
      upload: async (p: string) => {
        files.add(p);
        return { error: null };
      },
      remove: async (paths: string[]) => {
        paths.forEach((p) => files.delete(p));
        return { error: null };
      },
      list: async (prefix: string, opts: { limit: number; offset: number }) => {
        listCalls.push(prefix);
        if (listFails) return { data: null, error: { message: "boom" } };
        const names = [...files]
          .filter((p) => p.startsWith(`${prefix}/`))
          .map((p) => p.slice(prefix.length + 1))
          .sort();
        const page = names.slice(opts.offset, opts.offset + opts.limit).map((name) => ({ name, id: `id-${name}` }));
        return { data: page, error: null };
      },
    }),
  },
} as unknown as SupabaseClient;

const inFolder = (uid: string) => [...files].filter((p) => p.startsWith(`${uid}/`)).sort();

beforeEach(() => {
  files = new Set();
  avatarPath = null;
  listFails = false;
  listCalls = [];
});

describe("sweepAvatarFolder", () => {
  test("removes every file except the current picture", async () => {
    ["a.webp", "b.webp", "c.webp", "current.webp"].forEach((n) => files.add(`${ME}/${n}`));
    avatarPath = `${ME}/current.webp`;
    await sweepAvatarFolder(sb, ME);
    expect(inFolder(ME)).toEqual([`${ME}/current.webp`]);
  });

  test("keeps whatever the server says is current, even if another tab just changed it", async () => {
    files.add(`${ME}/mine.webp`);
    files.add(`${ME}/other-tab.webp`);
    avatarPath = `${ME}/other-tab.webp`; // set by another tab after this one uploaded
    await sweepAvatarFolder(sb, ME);
    expect(inFolder(ME)).toEqual([`${ME}/other-tab.webp`]);
  });

  test("pages through big folders", async () => {
    for (let i = 0; i < 250; i++) files.add(`${ME}/f${String(i).padStart(3, "0")}.webp`);
    avatarPath = `${ME}/f123.webp`;
    await sweepAvatarFolder(sb, ME);
    expect(inFolder(ME)).toEqual([`${ME}/f123.webp`]);
  });

  test("only looks in your own folder", async () => {
    files.add(`${OTHER}/theirs.webp`);
    files.add(`${ME}/old.webp`);
    await sweepAvatarFolder(sb, ME);
    expect(listCalls.every((p) => p === ME)).toBe(true);
    expect(inFolder(OTHER)).toEqual([`${OTHER}/theirs.webp`]);
    expect(inFolder(ME)).toEqual([]);
  });

  test("a failed listing is quiet and deletes nothing", async () => {
    files.add(`${ME}/old.webp`);
    listFails = true;
    await expect(sweepAvatarFolder(sb, ME)).resolves.toEqual([]);
    expect(inFolder(ME)).toEqual([`${ME}/old.webp`]);
  });
});

describe("storeAvatar", () => {
  const blob = () => new Blob(["x"], { type: "image/webp" });

  test("uploads, sets it, and clears out the old and orphaned files", async () => {
    files.add(`${ME}/avatar-1.webp`);
    files.add(`${ME}/failed-upload.webp`);
    avatarPath = `${ME}/avatar-1.webp`;
    const { path, url } = await storeAvatar(sb, ME, blob());
    expect(path).toMatch(new RegExp(`^${ME}/avatar-\\d+\\.webp$`));
    expect(url).toBe(`https://cdn.test/avatars/${path}`);
    expect(avatarPath).toBe(path);
    expect(inFolder(ME)).toEqual([path]);
  });

  test("if set_avatar fails, the new file goes and the current picture stays", async () => {
    files.add(`${ME}/avatar-1.webp`);
    avatarPath = `${ME}/avatar-1.webp`;
    const failing = {
      ...sb,
      rpc: async (fn: string, args?: { p_path?: string | null }) =>
        fn === "set_avatar" ? { data: null, error: { message: "avatar_path_invalid" } } : sb.rpc(fn, args),
    } as unknown as SupabaseClient;
    await expect(storeAvatar(failing, ME, blob())).rejects.toThrow("avatar_path_invalid");
    expect(avatarPath).toBe(`${ME}/avatar-1.webp`);
    expect(inFolder(ME)).toEqual([`${ME}/avatar-1.webp`]);
  });
});

describe("removeAvatar", () => {
  test("clears the picture and empties the folder", async () => {
    files.add(`${ME}/avatar-1.webp`);
    files.add(`${ME}/stray.webp`);
    avatarPath = `${ME}/avatar-1.webp`;
    await removeAvatar(sb, ME);
    expect(avatarPath).toBeNull();
    expect(inFolder(ME)).toEqual([]);
  });
});
