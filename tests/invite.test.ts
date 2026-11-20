import { beforeEach, describe, expect, test, vi } from "vitest";

// The playtest bug: a new player entered an invite code, signed in with Google, set a name and
// birthday, and was asked for the code again. The code only travelled in ?next=, which Supabase
// drops when the redirect URL isn't allow-listed. These tests walk the same journey through the
// real route handlers with the browser's cookie jar and the database stubbed out.

const jar = new Map<string, string>();
const cookieOptions = new Map<string, Record<string, unknown> | undefined>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, value);
      cookieOptions.set(name, options);
    },
    delete: (name: string) => void jar.delete(name),
  }),
}));

type Db = { codes: Map<string, string | null>; profile: boolean; rateLimited: boolean };
let db: Db;
let user: { id: string } | null;
const rpcCalls: string[] = [];

const client = {
  auth: {
    getUser: async () => ({ data: { user } }),
    exchangeCodeForSession: async () => {
      user = { id: "new-player" };
      return { error: null };
    },
  },
  rpc: async (fn: string, args?: { p_code?: string }) => {
    rpcCalls.push(fn);
    const uid = user?.id ?? null;
    if (fn === "redeem_access_code") {
      if (db.rateLimited) return { data: null, error: { message: "rate_limited" } };
      if ([...db.codes.values()].includes(uid)) return { data: true, error: null };
      const c = args!.p_code!.toUpperCase().replace(/[\s-]/g, "");
      if (!db.codes.has(c) || db.codes.get(c) !== null) return { data: false, error: null };
      db.codes.set(c, uid);
      return { data: true, error: null };
    }
    if (fn === "has_access") return { data: [...db.codes.values()].includes(uid), error: null };
    if (fn === "my_player") return { data: db.profile ? [{ username: "Ada", needs_rename: false }] : [], error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

const { GET: redeemRoute } = await import("@/app/redeem/[code]/route");
const { GET: callbackRoute } = await import("@/app/auth/callback/route");
const { requirePlayer } = await import("@/lib/session");
const { INVITE_COOKIE } = await import("@/lib/invite");

const SITE = "https://erudent.test";
const location = (r: Response) => r.headers.get("location")!.replace(SITE, "");
const redeem = (code: string) => redeemRoute(new Request(`${SITE}/redeem/${code}`), { params: Promise.resolve({ code }) });
const callback = (query: string) => callbackRoute(new Request(`${SITE}/auth/callback?${query}`));

beforeEach(() => {
  jar.clear();
  cookieOptions.clear();
  rpcCalls.length = 0;
  redirect.mockClear();
  user = null;
  db = { codes: new Map([["ABCDEFGH", null]]), profile: false, rateLimited: false };
});

describe("invite code entered before signing in", () => {
  test("bound at sign-in even when Google comes back without ?next (Supabase redirect fallback)", async () => {
    // Landing page → /redeem: signed out, so off to sign in with the code kept aside.
    expect(location(await redeem("ABCD-EFGH"))).toBe("/login?next=/play");
    expect(jar.get(INVITE_COOKIE)).toBe("ABCD-EFGH");
    // Lax, not Strict: it has to come back with the cross-site redirect from Google.
    expect(cookieOptions.get(INVITE_COOKIE)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(db.codes.get("ABCDEFGH")).toBeNull();

    // Supabase didn't accept the redirect URL: the middleware sends the sign-in code to the
    // callback with the default next=/play. The invite is redeemed right here.
    expect(location(await callback("code=oauth&next=%2Fplay"))).toBe("/onboarding?next=%2Fplay");
    expect(db.codes.get("ABCDEFGH")).toBe("new-player");
    expect(jar.has(INVITE_COOKIE)).toBe(false);

    // Name + birthday saved → /play lets them in; nothing asks for the code.
    db.profile = true;
    const { profile } = await requirePlayer("/play");
    expect(profile.username).toBe("Ada");
    expect(redirect).not.toHaveBeenCalled();
  });

  test("the code is redeemed before the profile check, so onboarding comes after access", async () => {
    await redeem("ABCDEFGH");
    await callback("code=oauth");
    expect(rpcCalls.indexOf("redeem_access_code")).toBeLessThan(rpcCalls.indexOf("my_player"));
  });

  test("a code taken in the meantime → landing page error, cookie cleared", async () => {
    await redeem("ABCDEFGH");
    db.codes.set("ABCDEFGH", "someone-else");
    expect(location(await callback("code=oauth"))).toBe("/?redeem=invalid");
    expect(jar.has(INVITE_COOKIE)).toBe(false);
  });

  test("rate limited → landing page says so", async () => {
    await redeem("ABCDEFGH");
    db.rateLimited = true;
    expect(location(await callback("code=oauth"))).toBe("/?redeem=limited");
  });

  test("a sign-in with no invite waiting doesn't try to redeem", async () => {
    expect(location(await callback("code=oauth&next=%2Fplay"))).toBe("/onboarding?next=%2Fplay");
    expect(rpcCalls).not.toContain("redeem_access_code");
  });
});

describe("invite code entered while signed in", () => {
  beforeEach(() => {
    user = { id: "new-player" };
  });

  test("redeemed straight away, no cookie left behind", async () => {
    jar.set(INVITE_COOKIE, "STALE");
    expect(location(await redeem("ABCDEFGH"))).toBe("/play");
    expect(db.codes.get("ABCDEFGH")).toBe("new-player");
    expect(jar.has(INVITE_COOKIE)).toBe(false);
  });

  test("bad code → landing page error", async () => {
    expect(location(await redeem("ZZZZZZZZ"))).toBe("/?redeem=invalid");
  });
});
