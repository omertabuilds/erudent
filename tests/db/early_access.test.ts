import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { asUser, createDb, rpc, type Db } from "./harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

type Headers = Record<string, string>;

/**
 * Call an early-access RPC the way PostgREST would: request headers in `request.headers`.
 * `from` is either a cf-connecting-ip (string) or the full header set. Signed out unless `uid`.
 */
async function call<T = unknown>(fn: string, arg: string, from: string | Headers = "203.0.113.1", uid: string | null = null) {
  const headers = typeof from === "string" ? { "cf-connecting-ip": from } : from;
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    const res = await tx.query<{ v: T }>(`select public.${fn}($1) as v`, [arg]);
    return res.rows[0].v;
  });
}

async function makeCodes(n: number) {
  const res = await db.query<{ c: string }>(`select private.create_access_codes($1, 'test') as c`, [n]);
  return res.rows.map((r) => r.c);
}

async function signedInUser() {
  const id = randomUUID();
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  return id;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_FORMAT = new RegExp(`^[${ALPHABET}]{4}-[${ALPHABET}]{4}$`);
/** Well-formed, but never issued. */
const UNISSUED = "ZZZZ-ZZZZ";

describe("waitlist", () => {
  test("stores a normalized email once", async () => {
    await call("join_waitlist", "  Ada@School.EDU ");
    await call("join_waitlist", "ada@school.edu");
    const rows = await db.query<{ email: string }>(`select email from waitlist`);
    expect(rows.rows).toEqual([{ email: "ada@school.edu" }]);
  });

  test("rejects bad emails", async () => {
    for (const bad of ["", "ada", "ada@school", "a b@c.d", `${"a".repeat(250)}@x.io`]) {
      await expect(call("join_waitlist", bad)).rejects.toThrow("invalid_email");
    }
  });

  test("rate limits per IP", async () => {
    for (let i = 0; i < 20; i++) await call("join_waitlist", `p${i}@x.io`);
    await expect(call("join_waitlist", "p20@x.io")).rejects.toThrow("rate_limited");
    await call("join_waitlist", "other@x.io", "198.51.100.7"); // another IP is fine
  });

  test("a spoofed x-forwarded-for doesn't get a fresh bucket", async () => {
    // Cloudflare appends to a client-sent X-Forwarded-For, so its first entry is attacker-chosen.
    // Only cf-connecting-ip counts.
    for (let i = 0; i < 20; i++) {
      await call("join_waitlist", `s${i}@x.io`, { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": `10.9.9.${i}, 203.0.113.9` });
    }
    await expect(
      call("join_waitlist", "s20@x.io", { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.9.9.99, 203.0.113.9" }),
    ).rejects.toThrow("rate_limited");
  });

  test("no cf-connecting-ip → one shared bucket, not unlimited", async () => {
    for (let i = 0; i < 20; i++) await call("join_waitlist", `n${i}@x.io`, { "x-forwarded-for": `10.8.8.${i}` });
    await expect(call("join_waitlist", "n20@x.io", { "x-forwarded-for": "10.8.8.99" })).rejects.toThrow("rate_limited");
  });

  test("the browser can't read the list", async () => {
    await call("join_waitlist", "ada@school.edu");
    await expect(asUser(db, null, `select * from waitlist`)).rejects.toThrow(/permission denied/);
  });
});

describe("access codes", () => {
  test("codes are XXXX-XXXX from an alphabet without 0/O/1/I/L", async () => {
    const codes = await makeCodes(200);
    expect(new Set(codes).size).toBe(200);
    for (const c of codes) expect(c).toMatch(CODE_FORMAT);
    const used = new Set(codes.join("").replace(/-/g, ""));
    for (const banned of "0O1IL") expect(used.has(banned)).toBe(false);
  });

  test("only a sha256 of the code is stored", async () => {
    const [code] = await makeCodes(1);
    const rows = await db.query<Record<string, unknown>>(`select * from access_codes`);
    expect(Object.keys(rows.rows[0]).sort()).toEqual(["code_hash", "created_at", "note", "redeemed_at", "redeemed_by"]);
    const expected = createHash("sha256").update(code.replace("-", "")).digest("hex");
    expect(rows.rows[0].code_hash).toBe(expected);
    expect(JSON.stringify(rows.rows)).not.toContain(code.replace("-", ""));
  });

  test("check is forgiving about case, spaces and dashes, and doesn't use the code up", async () => {
    const [code] = await makeCodes(1);
    const bare = code.replace("-", "");
    expect(await call("check_access_code", code)).toBe(true);
    expect(await call("check_access_code", bare)).toBe(true);
    expect(await call("check_access_code", ` ${bare.slice(0, 4).toLowerCase()} ${bare.slice(4)} `)).toBe(true);
    expect(await call("check_access_code", UNISSUED)).toBe(false);
  });

  test("malformed codes are rejected without a lookup", async () => {
    for (const bad of ["", "nope", "ABCD-EFG", "ABCD-EFGHJ", "ABCD-EFG0", "ABCD-EFGO", "ABCD-EFGI", "ABCD-EFGL", "ABCD-EFG1"]) {
      expect(await call("check_access_code", bad, `198.51.100.${bad.length}`)).toBe(false);
    }
    const res = await db.query<{ h: string | null }>(`select private.hash_access_code('ABCD-EFG0') as h`);
    expect(res.rows[0].h).toBeNull();
  });

  test("redeem ties a code to one account, once", async () => {
    const [code, spare] = await makeCodes(2);
    const ada = await signedInUser();
    const bob = await signedInUser();

    expect(await call("redeem_access_code", code.toLowerCase(), "1.1.1.1", ada)).toBe(true);
    expect(await call("redeem_access_code", code, "1.1.1.1", ada)).toBe(true); // again: still fine
    expect(await call("check_access_code", code)).toBe(false);
    expect(await call("redeem_access_code", code, "1.1.1.1", bob)).toBe(false);

    // Ada already has access: a second code is left for someone else.
    expect(await call("redeem_access_code", spare, "1.1.1.1", ada)).toBe(true);
    expect(await call("check_access_code", spare)).toBe(true);

    const hash = createHash("sha256").update(code.replace("-", "")).digest("hex");
    const row = await db.query<{ redeemed_by: string }>(`select redeemed_by from access_codes where code_hash = $1`, [hash]);
    expect(row.rows[0].redeemed_by).toBe(ada);
  });

  test("redeem needs a signed-in user", async () => {
    const [code] = await makeCodes(1);
    await expect(call("redeem_access_code", code)).rejects.toThrow(/permission denied/);
  });

  test("check is rate limited per IP, redeem per account", async () => {
    for (let i = 0; i < 20; i++) await call("check_access_code", UNISSUED);
    await expect(call("check_access_code", UNISSUED)).rejects.toThrow("rate_limited");

    const ada = await signedInUser();
    for (let i = 0; i < 10; i++) {
      expect(await call("redeem_access_code", UNISSUED, `10.0.0.${i}`, ada)).toBe(false);
    }
    await expect(call("redeem_access_code", UNISSUED, "10.0.1.1", ada)).rejects.toThrow("rate_limited");
  });

  test("the browser can't read codes or call the admin function", async () => {
    await makeCodes(1);
    await expect(asUser(db, null, `select * from access_codes`)).rejects.toThrow(/permission denied/);
    const uid = await signedInUser();
    await expect(rpc(db, uid, "check_access_code", [UNISSUED])).resolves.toBe(false);
    await expect(asUser(db, uid, `select private.create_access_codes(1, 'x')`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, uid, `select private.hash_access_code('ABCD-EFGH')`)).rejects.toThrow(/permission denied/);
  });
});

describe("has_access", () => {
  test("false until you redeem a code, then true; another account's code doesn't count", async () => {
    const [code] = await makeCodes(1);
    const ada = await signedInUser();
    const bob = await signedInUser();
    expect(await rpc(db, ada, "has_access")).toBe(false);

    expect(await call("redeem_access_code", code, "1.1.1.1", ada)).toBe(true);
    expect(await rpc(db, ada, "has_access")).toBe(true);
    expect(await rpc(db, bob, "has_access")).toBe(false);
  });

  test("a bad code doesn't grant access", async () => {
    const ada = await signedInUser();
    expect(await call("redeem_access_code", UNISSUED, "1.1.1.1", ada)).toBe(false);
    expect(await rpc(db, ada, "has_access")).toBe(false);
  });

  test("needs sign-in", async () => {
    await expect(asUser(db, null, `select public.has_access()`)).rejects.toThrow(/permission denied/);
  });
});

describe("schema", () => {
  test("every function in public and private pins its search_path", async () => {
    const res = await db.query<{ fn: string }>(`
      select n.nspname || '.' || p.proname as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       order by 1`);
    expect(res.rows.map((r) => r.fn)).toEqual([]);
  });
});
