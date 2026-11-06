-- =====================================================================
-- Early access: waitlist + invitation codes.
--
-- Same rule as core: the browser reads none of these tables. It calls
-- the functions below, which validate input and rate-limit callers.
--
--   join_waitlist(email)        anyone      Save an email. Duplicates are a quiet success.
--   check_access_code(code)     anyone      Is this code real and unused? Doesn't use it up.
--   redeem_access_code(code)    signed in   Use the code up and tie it to this account. False if bad.
--   private.create_access_codes(n, note)    service role / SQL editor: make n new codes.
--
-- Codes look like XXXX-XXXX: 8 characters from a 31-letter alphabet with no
-- 0/O/1/I/L (~39.6 bits). Input is forgiving: case, spaces and dashes are ignored.
-- Only a SHA-256 of the normalized code is stored. The plain code is shown once,
-- when it's made, and never again.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.waitlist (
  id         bigint generated always as identity primary key,
  email      text not null unique check (email = lower(email) and length(email) <= 254),
  created_at timestamptz not null default now()
);

create table public.access_codes (
  code_hash   text primary key check (code_hash ~ '^[0-9a-f]{64}$'),  -- sha256 of the 8-char code
  note        text not null default '',          -- who it was made for, e.g. 'waitlist batch 1'
  created_at  timestamptz not null default now(),
  redeemed_by uuid unique references auth.users(id) on delete set null,  -- one code per account
  redeemed_at timestamptz
);

-- Fixed-window counters for rate limiting. One row per (bucket, caller, window).
create table private.rate_limits (
  bucket       text not null,
  caller       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, caller, window_start)
);

alter table public.waitlist     enable row level security;
alter table public.access_codes enable row level security;
alter table private.rate_limits enable row level security;


-- ---------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------

-- The caller's IP. PostgREST copies the HTTP request headers into the
-- `request.headers` setting. On hosted Supabase, Cloudflare sits in front and
-- sets cf-connecting-ip to the address that connected to it, so the browser
-- can't choose it. Deliberately NOT x-forwarded-for: Cloudflare appends to a
-- client-sent X-Forwarded-For, so its first entry is whatever the client typed.
-- No header → 'unknown', one shared bucket (fails closed, not open).
-- Call these functions from the browser, not a Next server route, or every
-- visitor shares the server's IP.
create or replace function private.client_ip()
returns text language plpgsql stable as $$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
begin
  return coalesce(nullif(h->>'cf-connecting-ip', ''), 'unknown');
exception when others then
  return 'unknown';
end
$$;

-- Count one hit for `caller` in `bucket`. Raises rate_limited past `max_hits`
-- per `win`. Old windows for this caller are cleared as we go.
create or replace function private.rate_limit(p_bucket text, p_caller text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window))
                                      * extract(epoch from p_window));
  v_hits int;
begin
  delete from private.rate_limits
   where bucket = p_bucket and caller = p_caller and window_start < v_start;
  insert into private.rate_limits as r (bucket, caller, window_start, hits)
  values (p_bucket, p_caller, v_start, 1)
  on conflict (bucket, caller, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then raise exception 'rate_limited'; end if;
end
$$;

-- " abcd-efgh " → "ABCDEFGH". Returns null if it can't be a code.
create or replace function private.normalize_access_code(p text)
returns text language sql immutable as $$
  select case when c ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' then c end
    from (select upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')) as c) s
$$;

-- What we store and look up: hex sha256 of the normalized code. Null in → null out.
create or replace function private.hash_access_code(p text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(c, 'UTF8')), 'hex')
    from (select private.normalize_access_code(p) as c) s
   where c is not null
$$;

-- Admin: make `p_count` new codes and return them as XXXX-XXXX. Run in the SQL editor
-- and copy the result: only hashes are kept, so the codes can't be shown again.
--   select * from private.create_access_codes(50, 'waitlist batch 1');
-- Randomness comes from gen_random_uuid() (the server's secure random source),
-- not random(), which is predictable. Bytes 0–5 of a v4 UUID are fully random;
-- bytes ≥ 248 are skipped so `% 31` doesn't favour some letters.
create or replace function private.create_access_codes(p_count int, p_note text default '')
returns setof text language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  b bytea;
  v int;
  made int := 0;
begin
  if p_count < 1 or p_count > 1000 then raise exception 'count must be 1–1000'; end if;
  while made < p_count loop
    v_code := '';
    while length(v_code) < 8 loop
      b := uuid_send(gen_random_uuid());
      for j in 0..5 loop
        v := get_byte(b, j);
        if v < 248 and length(v_code) < 8 then
          v_code := v_code || substr(alphabet, 1 + v % 31, 1);
        end if;
      end loop;
    end loop;
    insert into access_codes (code_hash, note) values (private.hash_access_code(v_code), coalesce(p_note, ''))
      on conflict (code_hash) do nothing;
    if found then
      made := made + 1;
      return next substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
    end if;
  end loop;
end
$$;


-- ---------------------------------------------------------------------
-- Public functions (called from the app)
-- ---------------------------------------------------------------------

-- Waitlist. 20 tries per IP per 10 minutes (school networks share an IP).
-- Already on the list → same success, so this can't be used to look people up.
create or replace function public.join_waitlist(p_email text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  perform private.rate_limit('waitlist', private.client_ip(), 20, interval '10 minutes');
  if length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  insert into waitlist (email) values (e) on conflict (email) do nothing;
end
$$;

-- True if the code exists and hasn't been used. Doesn't use it up.
-- 20 tries per IP per 10 minutes.
create or replace function public.check_access_code(p_code text)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  h text := private.hash_access_code(p_code);
begin
  perform private.rate_limit('check_code', private.client_ip(), 20, interval '10 minutes');
  return h is not null and exists (select 1 from access_codes where code_hash = h and redeemed_by is null);
end
$$;

-- Use a code up and tie it to the signed-in account. 10 tries per account per 10 minutes.
-- Already redeemed by you → true again. You already hold a different code → true,
-- and this one stays unused for someone else. A bad code returns false rather than
-- raising, so the failed try still counts toward the rate limit (an error would roll it back).
create or replace function public.redeem_access_code(p_code text)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  h text := private.hash_access_code(p_code);
begin
  perform private.rate_limit('redeem_code', uid::text, 10, interval '10 minutes');
  if exists (select 1 from access_codes where redeemed_by = uid) then return true; end if;
  update access_codes set redeemed_by = uid, redeemed_at = now()
   where code_hash = h and redeemed_by is null;
  return found;
end
$$;


-- ---------------------------------------------------------------------
-- Grants. New functions get EXECUTE for PUBLIC by default, so revoke first.
-- ---------------------------------------------------------------------

revoke all on public.waitlist, public.access_codes from anon, authenticated;
grant all on public.waitlist, public.access_codes to service_role;

revoke all on function
  private.client_ip(),
  private.rate_limit(text, text, int, interval),
  private.normalize_access_code(text),
  private.hash_access_code(text),
  private.create_access_codes(int, text),
  public.join_waitlist(text),
  public.check_access_code(text),
  public.redeem_access_code(text)
from public, anon, authenticated;

grant execute on function public.join_waitlist(text), public.check_access_code(text) to anon, authenticated;
grant execute on function public.redeem_access_code(text) to authenticated;

grant execute on function
  public.join_waitlist(text),
  public.check_access_code(text),
  public.redeem_access_code(text),
  private.client_ip(),
  private.rate_limit(text, text, int, interval),
  private.normalize_access_code(text),
  private.hash_access_code(text),
  private.create_access_codes(int, text)
to service_role;
