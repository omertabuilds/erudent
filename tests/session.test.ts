import { beforeEach, describe, expect, test, vi } from "vitest";

// requirePlayer's redirects, in order. The database side of has_access and my_player
// is tested in tests/db; here the Supabase client is a stand-in.

const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

type State = {
  user: { id: string } | null;
  access: boolean;
  player: { username: string; needs_rename: boolean } | null;
};
let state: State;

const client = {
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  rpc: async (fn: string) => {
    if (fn === "has_access") return { data: state.access, error: null };
    if (fn === "my_player") return { data: state.player ? [state.player] : [], error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const { requirePlayer } = await import("@/lib/session");

beforeEach(() => {
  redirect.mockClear();
  state = { user: { id: "u1" }, access: true, player: { username: "Ada", needs_rename: false } };
});

describe("requirePlayer", () => {
  test("signed out → sign in, then come back", async () => {
    state.user = null;
    await expect(requirePlayer("/play")).rejects.toThrow("REDIRECT /login?next=%2Fplay");
  });

  test("signed in without a redeemed code → landing page, on the code tab", async () => {
    state.access = false;
    await expect(requirePlayer("/play")).rejects.toThrow("REDIRECT /?access=required");
    expect(redirect).toHaveBeenCalledWith("/?access=required");
  });

  test("no code beats every other step: no profile, or a flagged name", async () => {
    state.access = false;
    state.player = null;
    await expect(requirePlayer("/play")).rejects.toThrow(/^REDIRECT \/\?access=required$/);
    state.player = { username: "xxx", needs_rename: true };
    await expect(requirePlayer("/match/abc")).rejects.toThrow(/^REDIRECT \/\?access=required$/);
  });

  test("code redeemed, no profile yet → onboarding", async () => {
    state.player = null;
    await expect(requirePlayer("/play")).rejects.toThrow("REDIRECT /onboarding?next=%2Fplay");
  });

  test("code redeemed, flagged name → rename", async () => {
    state.player = { username: "xxx", needs_rename: true };
    await expect(requirePlayer("/match/abc")).rejects.toThrow("REDIRECT /onboarding/rename?next=%2Fmatch%2Fabc");
  });

  test("code redeemed and a good profile → in", async () => {
    const { profile } = await requirePlayer("/play");
    expect(profile.username).toBe("Ada");
    expect(redirect).not.toHaveBeenCalled();
  });
});
