import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Minimal stand-ins for what Supabase provides: roles, auth.users, auth.uid().
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  -- Just enough of Supabase Storage for bucket rows and object policies.
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text not null, owner uuid,
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  -- Folders of an object path: 'a/b/c.webp' → {a,b}.
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
`;

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");

/**
 * A fresh database with every migration applied, in filename order.
 * `before` runs a step just before the named migration, e.g. to add rows it has to cope with.
 */
export async function createDb(before: Record<string, (db: PGlite) => Promise<void>> = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await before[file]?.(db);
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

/** Run SQL as a signed-in user, with row level security applied. */
export async function asUser<T = Record<string, unknown>>(
  db: Db,
  uid: string | null,
  sql: string,
  params: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    const res = await tx.query<T>(sql, params);
    return res.rows;
  });
}

/** Call one RPC as a user and return its single value. */
export async function rpc<T = unknown>(db: Db, uid: string, fn: string, args: unknown[] = []): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await asUser<{ v: T }>(db, uid, `select public.${fn}(${placeholders}) as v`, args);
  return rows[0].v;
}

/** Make a signed-in user with a profile. They've redeemed an invitation code unless `access` is false. */
export async function makeUser(db: Db, username: string, elo = 900, matchesPlayed = 0, access = true) {
  const id = randomUUID();
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  await rpc(db, id, "create_profile", [username, "2008-01-01"]);
  if (access) await grantAccess(db, id);
  await db.query(`update profiles set elo = $2, matches_played = $3 where id = $1`, [id, elo, matchesPlayed]);
  return id;
}

/** Give a user a redeemed invitation code, as if they'd entered one. */
export async function grantAccess(db: Db, uid: string) {
  await db.query(
    `insert into access_codes (code_hash, note, redeemed_by, redeemed_at)
     values (encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'test', $1, now())`,
    [uid],
  );
}

/** Seed `perTier` questions in every tier of one pool. Answer of question i in tier t is "t*100+i". */
export async function seedQuestions(db: Db, perTier = 5, pool: "ranked" | "practice" = "ranked") {
  for (let t = 1; t <= 6; t++) {
    for (let i = 1; i <= perTier; i++) {
      await db.query(
        `insert into questions (tier, topic, prompt, answer, solution, pool) values ($1, 'Algebra', $2, $3, 'because', $4)`,
        [t, `Tier ${t} ${pool} question ${i}`, String(t * 100 + i), pool],
      );
    }
  }
}

/** Move a match's clock: started `secondsAgo` seconds ago (ends 5 min after start). */
export async function startedAgo(db: Db, matchId: string, secondsAgo: number) {
  await db.query(
    `update matches set started_at = now() - make_interval(secs => $2),
                        ends_at = now() - make_interval(secs => $2) + interval '5 minutes'
      where id = $1`,
    [matchId, secondsAgo],
  );
}

/** The correct answer for a slot (admin view, for tests only). */
export async function answerFor(db: Db, matchId: string, slot: string) {
  const res = await db.query<{ answer: string }>(
    `select q.answer from match_questions mq join questions q on q.id = mq.question_id
      where mq.match_id = $1 and mq.slot = $2`,
    [matchId, slot],
  );
  return res.rows[0].answer;
}
