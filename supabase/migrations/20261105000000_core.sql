-- =====================================================================
-- Erudent core: tables, security, and game logic.
--
-- Rule of thumb: the browser can READ profiles, and that's it.
-- Everything else (matchmaking, answers, scoring, Elo) happens inside
-- the functions below, which run on the server and check who's calling.
-- Question answers never leave the database until a match is finished.
-- =====================================================================


create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Small pure helpers (safe to expose)
-- ---------------------------------------------------------------------

-- Elo → question tier / rank number (1 Novice … 6 Erudite)
create or replace function public.tier_for_elo(p_elo int)
returns int language sql immutable as $$
  select case
    when p_elo < 700  then 1
    when p_elo < 900  then 2
    when p_elo < 1100 then 3
    when p_elo < 1300 then 4
    when p_elo < 1500 then 5
    else 6 end
$$;

-- Rank shown to players. Hidden until 10 placement matches are done.
create or replace function public.rank_name(p_elo int, p_matches int)
returns text language sql immutable as $$
  select case when p_matches < 10 then 'Unranked'
    else (array['Novice','Apprentice','Scholar','Savant','Sage','Erudite'])[public.tier_for_elo(p_elo)]
  end
$$;

-- Answers are integers or fractions. "6/8", " 3/4 ", "-3/-4" → "3/4"; "007" → "7"; "4/2" → "2".
-- Decimals and anything else return null (invalid format).
create or replace function public.normalize_answer(p text)
returns text language plpgsql immutable as $$
declare
  s text;
  parts text[];
  n numeric;
  d numeric;
  g numeric;
begin
  if p is null then return null; end if;
  s := regexp_replace(p, '\s+', '', 'g');
  s := replace(s, '−', '-');               -- unicode minus
  if length(s) > 40 then return null; end if;

  if s ~ '^-?[0-9]+$' then
    return (s::numeric)::text;
  elsif s ~ '^-?[0-9]+/-?[0-9]+$' then
    parts := string_to_array(s, '/');
    n := parts[1]::numeric;
    d := parts[2]::numeric;
    if d = 0 then return null; end if;
    if d < 0 then n := -n; d := -d; end if;
    g := gcd(abs(n), d);
    n := div(n, g);
    d := div(d, g);
    if d = 1 then return n::text; end if;
    return n::text || '/' || d::text;
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  elo            int  not null default 900,
  matches_played int  not null default 0,   -- rated matches only (ranked + async)
  wins           int  not null default 0,
  losses         int  not null default 0,
  draws          int  not null default 0,
  created_at     timestamptz not null default now()
);

create table public.questions (
  id         uuid primary key default gen_random_uuid(),
  notion_id  text unique,                  -- page id in the Notion Question Bank
  tier       int  not null check (tier between 1 and 6),
  topic      text not null,
  prompt     text not null,
  answer     text not null,                -- stored normalized (see trigger)
  solution   text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  mode            text not null check (mode in ('ranked','friend','async')),
  status          text not null default 'waiting' check (status in ('waiting','active','finished')),
  invite_code     text unique,
  avg_elo         int,
  source_match_id uuid references public.matches(id),   -- async: the recorded match being replayed
  ghost_user_id   uuid references public.profiles(id),  -- async: whose run is being replayed
  forfeited_by    uuid references public.profiles(id),
  started_at      timestamptz,
  ends_at         timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table public.match_questions (
  match_id    uuid not null references public.matches(id) on delete cascade,
  slot        text not null check (slot in ('A','B','C')),
  question_id uuid not null references public.questions(id),
  points      int  not null check (points between 1 and 3),
  primary key (match_id, slot)
);

create table public.match_players (
  match_id      uuid not null references public.matches(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  is_ghost      boolean not null default false,
  elo_before    int not null,
  elo_after     int,
  score         int not null default 0,
  tiebreak_ms   int not null default 0,
  result        text check (result in ('win','loss','draw')),
  focus_strikes int not null default 0,
  last_seen     timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table public.submissions (
  match_id      uuid not null references public.matches(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  slot          text not null check (slot in ('A','B','C')),
  answer        text,                      -- null = forfeited (focus mode)
  correct       boolean not null,
  ms_from_start int not null,
  submitted_at  timestamptz not null default now(),
  primary key (match_id, user_id, slot)
);

create table public.queue (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  elo       int not null,
  joined_at timestamptz not null default now(),
  last_poll timestamptz not null default now()
);

create table public.seen_questions (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  seen_at     timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table public.flags (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references public.matches(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now()
);

create table public.reports (
  id               bigint generated always as identity primary key,
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  match_id         uuid not null references public.matches(id) on delete cascade,
  kind             text not null check (kind in ('question','player')),
  question_id      uuid references public.questions(id),
  reported_user_id uuid references public.profiles(id),
  reason           text not null,
  resolved         boolean not null default false,
  created_at       timestamptz not null default now()
);

create index on public.match_players (user_id);
create index on public.matches (status, mode, finished_at);
create index on public.questions (tier) where active;

-- Normalize answers on the way in; reject anything that isn't an integer or fraction.
create or replace function private.questions_normalize()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  new.answer := public.normalize_answer(new.answer);
  if new.answer is null then
    raise exception 'invalid_answer_format: answers must be integers or fractions like 3/4';
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger questions_normalize
  before insert or update on public.questions
  for each row execute function private.questions_normalize();

-- ---------------------------------------------------------------------
-- Row level security: on everywhere. Only profiles are directly readable.
-- ---------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.questions       enable row level security;
alter table public.matches         enable row level security;
alter table public.match_questions enable row level security;
alter table public.match_players   enable row level security;
alter table public.submissions     enable row level security;
alter table public.queue           enable row level security;
alter table public.seen_questions  enable row level security;
alter table public.flags           enable row level security;
alter table public.reports         enable row level security;

create policy "profiles are public" on public.profiles for select using (true);

-- ---------------------------------------------------------------------
-- Internal helpers (private schema, not callable from the browser)
-- ---------------------------------------------------------------------

create or replace function private.require_uid()
returns uuid language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  return uid;
end
$$;

-- Picks A (one tier below), B (at tier) and C (one tier above) for a match,
-- clamped to tiers 1–6, preferring questions none of the players has seen.
create or replace function private.pick_questions(p_match uuid, p_tier int, p_users uuid[])
returns void language plpgsql as $$
declare
  i int;
  v_tier int;
  v_qid uuid;
begin
  for i in 1..3 loop
    v_tier := least(6, greatest(1, p_tier + i - 2));
    select q.id into v_qid
      from public.questions q
     where q.active and q.tier = v_tier
       and q.id not in (select mq.question_id from public.match_questions mq where mq.match_id = p_match)
     order by exists (select 1 from public.seen_questions s
                       where s.question_id = q.id and s.user_id = any (p_users)),
              random()
     limit 1;
    if v_qid is null then
      raise exception 'no_questions_for_tier %', v_tier;
    end if;
    insert into public.match_questions (match_id, slot, question_id, points)
    values (p_match, (array['A','B','C'])[i], v_qid, i);
  end loop;
end
$$;

-- Starts a live match between two players. Countdown 5s, then 5 minutes.
create or replace function private.create_match(p_mode text, p1 uuid, p2 uuid)
returns uuid language plpgsql as $$
declare
  e1 int;
  e2 int;
  v_avg int;
  v_mid uuid;
begin
  select elo into e1 from public.profiles where id = p1;
  select elo into e2 from public.profiles where id = p2;
  v_avg := round((e1 + e2) / 2.0);
  insert into public.matches (mode, status, avg_elo, started_at, ends_at)
  values (p_mode, 'active', v_avg, now() + interval '5 seconds', now() + interval '5 minutes 5 seconds')
  returning id into v_mid;
  insert into public.match_players (match_id, user_id, elo_before) values (v_mid, p1, e1), (v_mid, p2, e2);
  perform private.pick_questions(v_mid, public.tier_for_elo(v_avg), array[p1, p2]);
  return v_mid;
end
$$;

-- Async: replay a recorded run from a finished ranked match by a player within 400 Elo,
-- using a question set this player hasn't seen. Returns null if there isn't one.
create or replace function private.create_async_match(p_uid uuid)
returns uuid language plpgsql as $$
declare
  v_elo int;
  src record;
  v_mid uuid;
begin
  select elo into v_elo from public.profiles where id = p_uid;

  select m.id as match_id, mp.user_id, mp.elo_before into src
    from public.matches m
    join public.match_players mp on mp.match_id = m.id and not mp.is_ghost
   where m.mode = 'ranked' and m.status = 'finished' and m.forfeited_by is null
     and mp.user_id <> p_uid
     and abs(mp.elo_before - v_elo) <= 400
     and not exists (
       select 1 from public.match_questions mq
         join public.seen_questions s on s.question_id = mq.question_id and s.user_id = p_uid
        where mq.match_id = m.id)
   order by abs(mp.elo_before - v_elo), m.finished_at desc
   limit 1;

  if not found then return null; end if;

  insert into public.matches (mode, status, avg_elo, source_match_id, ghost_user_id, started_at, ends_at)
  values ('async', 'active', round((v_elo + src.elo_before) / 2.0), src.match_id, src.user_id,
          now() + interval '5 seconds', now() + interval '5 minutes 5 seconds')
  returning id into v_mid;

  insert into public.match_players (match_id, user_id, elo_before) values (v_mid, p_uid, v_elo);
  insert into public.match_players (match_id, user_id, elo_before, is_ghost) values (v_mid, src.user_id, src.elo_before, true);
  insert into public.match_questions (match_id, slot, question_id, points)
    select v_mid, slot, question_id, points from public.match_questions where match_id = src.match_id;
  return v_mid;
end
$$;

-- Scores a match, decides the result, updates Elo. Safe to call more than once.
create or replace function private.finish_match(p_match uuid, p_forfeit uuid)
returns void language plpgsql as $$
declare
  m public.matches;
  a public.match_players;
  b public.match_players;
  v_winner uuid;
  v_draw boolean := false;
  p public.match_players;
  opp public.match_players;
  v_played int;
  v_k int;
  v_s numeric;
  v_exp numeric;
  v_new int;
begin
  select * into m from public.matches where id = p_match for update;
  if m.status <> 'active' then return; end if;

  -- live players: points and tiebreak time from their own correct answers
  update public.match_players mp
     set score = coalesce(x.score, 0), tiebreak_ms = coalesce(x.tb, 0)
    from (select s.user_id,
                 sum(mq.points) filter (where s.correct) as score,
                 sum(s.ms_from_start) filter (where s.correct) as tb
            from public.submissions s
            join public.match_questions mq on mq.match_id = s.match_id and mq.slot = s.slot
           where s.match_id = p_match
           group by s.user_id) x
   where mp.match_id = p_match and mp.user_id = x.user_id and not mp.is_ghost;

  -- async ghost: score from the recorded run
  if m.mode = 'async' then
    update public.match_players mp
       set score = coalesce(x.score, 0), tiebreak_ms = coalesce(x.tb, 0)
      from (select sum(mq.points) filter (where s.correct) as score,
                   sum(s.ms_from_start) filter (where s.correct) as tb
              from public.submissions s
              join public.match_questions mq on mq.match_id = s.match_id and mq.slot = s.slot
             where s.match_id = m.source_match_id and s.user_id = m.ghost_user_id) x
     where mp.match_id = p_match and mp.is_ghost;
  end if;

  select * into a from public.match_players where match_id = p_match order by is_ghost, user_id limit 1;
  select * into b from public.match_players where match_id = p_match order by is_ghost, user_id offset 1 limit 1;

  if b.user_id is null then
    -- friend match nobody joined: nothing to score
    update public.matches set status = 'finished', finished_at = now() where id = p_match;
    return;
  end if;

  if p_forfeit is not null then
    v_winner := case when p_forfeit = a.user_id then b.user_id else a.user_id end;
  elsif a.score <> b.score then
    v_winner := case when a.score > b.score then a.user_id else b.user_id end;
  elsif a.score > 0 and a.tiebreak_ms <> b.tiebreak_ms then
    v_winner := case when a.tiebreak_ms < b.tiebreak_ms then a.user_id else b.user_id end;
  else
    v_draw := true;
  end if;

  update public.match_players
     set result = case when v_draw then 'draw' when user_id = v_winner then 'win' else 'loss' end
   where match_id = p_match;

  -- Elo for live players in rated modes
  for p in select * from public.match_players where match_id = p_match and not is_ghost loop
    if m.mode in ('ranked', 'async') then
      select * into opp from public.match_players where match_id = p_match and user_id <> p.user_id;
      select matches_played into v_played from public.profiles where id = p.user_id;
      v_k   := case when v_played < 10 then 80 else 20 end;
      v_s   := case when v_draw then 0.5 when p.user_id = v_winner then 1 else 0 end;
      v_exp := 1 / (1 + power(10::numeric, (opp.elo_before - p.elo_before) / 400.0));
      v_new := greatest(100, round(p.elo_before + v_k * (v_s - v_exp)));

      update public.match_players set elo_after = v_new where match_id = p_match and user_id = p.user_id;
      update public.profiles
         set elo = v_new,
             matches_played = matches_played + 1,
             wins   = wins   + (case when v_s = 1   then 1 else 0 end),
             losses = losses + (case when v_s = 0   then 1 else 0 end),
             draws  = draws  + (case when v_s = 0.5 then 1 else 0 end)
       where id = p.user_id;
    else
      update public.match_players set elo_after = elo_before where match_id = p_match and user_id = p.user_id;
    end if;

    insert into public.seen_questions (user_id, question_id)
      select p.user_id, question_id from public.match_questions where match_id = p_match
    on conflict do nothing;
  end loop;

  update public.matches
     set status = 'finished', finished_at = now(), forfeited_by = p_forfeit
   where id = p_match;
end
$$;

-- Finishes the match if time is up or every live player has answered all three.
create or replace function private.finish_if_done(p_match uuid)
returns void language plpgsql as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match;
  if m.status <> 'active' then return; end if;
  if now() >= m.ends_at
     or (select count(*) from public.submissions where match_id = p_match)
        >= 3 * (select count(*) from public.match_players where match_id = p_match and not is_ghost) then
    perform private.finish_match(p_match, null);
  end if;
end
$$;

create or replace function private.player_row(p_match uuid, p_uid uuid)
returns public.match_players language plpgsql stable as $$
declare r public.match_players;
begin
  select * into r from public.match_players where match_id = p_match and user_id = p_uid and not is_ghost;
  if not found then raise exception 'not_participant'; end if;
  return r;
end
$$;

-- ---------------------------------------------------------------------
-- Public functions (called from the app)
-- ---------------------------------------------------------------------

-- Onboarding: pick a username, confirm age (13+). The birth date is NOT stored.
create or replace function public.create_profile(p_username text, p_birth_date date)
returns public.profiles language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  u text := lower(trim(p_username));
  r public.profiles;
begin
  if exists (select 1 from profiles where id = uid) then raise exception 'profile_exists'; end if;
  if p_birth_date is null or p_birth_date > current_date then raise exception 'invalid_birth_date'; end if;
  if extract(year from age(current_date, p_birth_date)) < 13 then raise exception 'too_young'; end if;
  if u !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid_username'; end if;
  if exists (select 1 from profiles where username = u) then raise exception 'username_taken'; end if;
  insert into profiles (id, username) values (uid, u) returning * into r;
  return r;
end
$$;

-- Ranked queue. Call every ~2s while searching.
-- Returns a match id when matched, or null while still waiting.
-- Matches within 200 Elo, widening to 400 after 15s. After 30s with nobody,
-- starts an async match against a recorded run (if one exists).
create or replace function public.join_queue()
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  v_elo int;
  q public.queue;
  opp public.queue;
  v_mid uuid;
  r record;
begin
  select elo into v_elo from profiles where id = uid;
  if not found then raise exception 'no_profile'; end if;

  -- one matchmaker at a time keeps pairing simple and race-free
  perform pg_advisory_xact_lock(hashtext('erudent_queue'));

  -- close out any old matches that ran out of time; resume one still in progress
  for r in select m.id, m.ends_at from matches m join match_players mp on mp.match_id = m.id
            where mp.user_id = uid and not mp.is_ghost and m.status = 'active' loop
    if now() >= r.ends_at then
      perform private.finish_match(r.id, null);
    else
      delete from queue where user_id = uid;
      return r.id;
    end if;
  end loop;

  insert into queue (user_id, elo) values (uid, v_elo)
  on conflict (user_id) do update set last_poll = now(), elo = excluded.elo;
  select * into q from queue where user_id = uid;

  select * into opp from queue o
   where o.user_id <> uid
     and o.last_poll > now() - interval '10 seconds'
     and abs(o.elo - v_elo) <= case when least(o.joined_at, q.joined_at) <= now() - interval '15 seconds'
                                    then 400 else 200 end
   order by abs(o.elo - v_elo), o.joined_at
   limit 1;

  if found then
    delete from queue where user_id in (uid, opp.user_id);
    return private.create_match('ranked', uid, opp.user_id);
  end if;

  if q.joined_at <= now() - interval '30 seconds' then
    v_mid := private.create_async_match(uid);
    if v_mid is not null then
      delete from queue where user_id = uid;
      return v_mid;
    end if;
  end if;

  return null;
end
$$;

create or replace function public.leave_queue()
returns void language sql security definer set search_path = public, private, pg_temp as $$
  delete from public.queue where user_id = private.require_uid();
$$;

-- Friend match: creator gets a 6-character code to share.
create or replace function public.create_friend_match()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  v_elo int;
  v_code text;
  v_mid uuid;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select elo into v_elo from profiles where id = uid;
  if not found then raise exception 'no_profile'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from matches where invite_code = v_code);
  end loop;
  insert into matches (mode, status, invite_code) values ('friend', 'waiting', v_code) returning id into v_mid;
  insert into match_players (match_id, user_id, elo_before) values (v_mid, uid, v_elo);
  return jsonb_build_object('match_id', v_mid, 'code', v_code);
end
$$;

create or replace function public.join_friend_match(p_code text)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  m public.matches;
  host public.match_players;
  v_elo int;
  v_avg int;
begin
  select elo into v_elo from profiles where id = uid;
  if not found then raise exception 'no_profile'; end if;

  select * into m from matches where invite_code = upper(trim(p_code)) and mode = 'friend' for update;
  if not found or m.created_at < now() - interval '1 hour' then raise exception 'invalid_code'; end if;
  if exists (select 1 from match_players where match_id = m.id and user_id = uid) then return m.id; end if;
  if m.status <> 'waiting' then raise exception 'match_full'; end if;

  select * into host from match_players where match_id = m.id limit 1;
  v_avg := round((host.elo_before + v_elo) / 2.0);
  insert into match_players (match_id, user_id, elo_before) values (m.id, uid, v_elo);
  update matches
     set status = 'active', avg_elo = v_avg,
         started_at = now() + interval '5 seconds', ends_at = now() + interval '5 minutes 5 seconds'
   where id = m.id;
  perform private.pick_questions(m.id, public.tier_for_elo(v_avg), array[host.user_id, uid]);
  return m.id;
end
$$;

-- Everything the match screen needs. Prompts appear only once the match starts;
-- answers and solutions only once it's finished. Opponent answers are never shown,
-- only which questions they've solved.
create or replace function public.get_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  m public.matches;
  me public.match_players;
  opp public.match_players;
  v_elapsed_ms bigint;
  v_opp_solved jsonb;
  v_questions jsonb;
  v_mine jsonb;
  v_opp_profile public.profiles;
  v_me_profile public.profiles;
begin
  me := private.player_row(p_match, uid);
  select * into m from matches where id = p_match;
  select * into opp from match_players where match_id = p_match and user_id <> uid;
  select * into v_me_profile from profiles where id = uid;
  select * into v_opp_profile from profiles where id = opp.user_id;
  v_elapsed_ms := case when m.started_at is null then 0
                       else greatest(0, floor(extract(epoch from (now() - m.started_at)) * 1000)) end;

  -- which slots the opponent has solved so far
  if m.mode = 'async' then
    select coalesce(jsonb_agg(s.slot order by s.slot), '[]') into v_opp_solved
      from submissions s
     where s.match_id = m.source_match_id and s.user_id = m.ghost_user_id and s.correct
       and (m.status = 'finished' or s.ms_from_start <= v_elapsed_ms);
  else
    select coalesce(jsonb_agg(s.slot order by s.slot), '[]') into v_opp_solved
      from submissions s
     where s.match_id = p_match and s.user_id = opp.user_id and s.correct;
  end if;

  -- my answers so far
  select coalesce(jsonb_agg(jsonb_build_object('slot', s.slot, 'answer', s.answer, 'correct', s.correct)
                            order by s.slot), '[]')
    into v_mine
    from submissions s where s.match_id = p_match and s.user_id = uid;

  if m.started_at is not null and now() >= m.started_at then
    select jsonb_agg(
             jsonb_build_object(
               'slot', mq.slot, 'points', mq.points, 'tier', q.tier, 'topic', q.topic, 'prompt', q.prompt)
             || case when m.status = 'finished'
                     then jsonb_build_object('answer', q.answer, 'solution', q.solution, 'question_id', q.id)
                     else '{}'::jsonb end
             order by mq.slot)
      into v_questions
      from match_questions mq join questions q on q.id = mq.question_id
     where mq.match_id = p_match;
  end if;

  return jsonb_build_object(
    'id', m.id,
    'mode', m.mode,
    'status', m.status,
    'invite_code', case when m.mode = 'friend' then m.invite_code end,
    'server_now', now(),
    'started_at', m.started_at,
    'ends_at', m.ends_at,
    'forfeited_by', m.forfeited_by,
    'me', jsonb_build_object(
      'user_id', uid, 'username', v_me_profile.username,
      'elo_before', me.elo_before, 'elo_after', me.elo_after,
      'score', me.score, 'tiebreak_ms', me.tiebreak_ms, 'result', me.result,
      'focus_strikes', me.focus_strikes, 'answers', v_mine,
      'rank', public.rank_name(coalesce(me.elo_after, me.elo_before), v_me_profile.matches_played)),
    'opponent', case when opp.user_id is null then null else jsonb_build_object(
      'username', v_opp_profile.username, 'is_ghost', opp.is_ghost,
      'elo_before', opp.elo_before, 'elo_after', opp.elo_after,
      'score', case when m.status = 'finished' then opp.score end,
      'result', opp.result, 'solved', v_opp_solved,
      'rank', public.rank_name(opp.elo_before, v_opp_profile.matches_played)) end,
    'questions', coalesce(v_questions, '[]'::jsonb)
  );
end
$$;

-- One attempt per question. Wrong format doesn't use up the attempt.
create or replace function public.submit_answer(p_match uuid, p_slot text, p_answer text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  m public.matches;
  v_norm text;
  v_q public.questions;
  v_ok boolean;
  v_ms int;
  v_prev_ms int;
  v_min_ms int;
begin
  perform private.player_row(p_match, uid);
  select * into m from matches where id = p_match for update;
  if m.status <> 'active' then return jsonb_build_object('status', 'match_over'); end if;
  if now() < m.started_at then return jsonb_build_object('status', 'not_started'); end if;
  if now() >= m.ends_at then
    perform private.finish_match(p_match, null);
    return jsonb_build_object('status', 'time_up');
  end if;

  select q.* into v_q from match_questions mq join questions q on q.id = mq.question_id
   where mq.match_id = p_match and mq.slot = p_slot;
  if not found then raise exception 'invalid_slot'; end if;

  if exists (select 1 from submissions where match_id = p_match and user_id = uid and slot = p_slot) then
    return jsonb_build_object('status', 'already_answered');
  end if;

  v_norm := public.normalize_answer(p_answer);
  if v_norm is null then return jsonb_build_object('status', 'invalid_format'); end if;

  v_ok := v_norm = v_q.answer;
  v_ms := floor(extract(epoch from (now() - m.started_at)) * 1000);
  insert into submissions (match_id, user_id, slot, answer, correct, ms_from_start)
  values (p_match, uid, p_slot, v_norm, v_ok, v_ms);

  -- too-fast check: time since this player's previous answer
  if v_ok then
    select coalesce(max(ms_from_start), 0) into v_prev_ms
      from submissions where match_id = p_match and user_id = uid and slot <> p_slot and ms_from_start <= v_ms;
    v_min_ms := case p_slot when 'A' then 3000 when 'B' then 8000 else 20000 end;
    if v_ms - v_prev_ms < v_min_ms then
      insert into flags (match_id, user_id, reason)
      values (p_match, uid, format('too_fast:%s:%sms', p_slot, v_ms - v_prev_ms));
    end if;
  end if;

  perform private.finish_if_done(p_match);
  return jsonb_build_object('status', 'ok', 'correct', v_ok);
end
$$;

-- Focus mode (ranked + async): first tab switch warns, later ones forfeit
-- the question on screen and flag the match.
create or replace function public.focus_event(p_match uuid, p_slot text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  m public.matches;
  v_strikes int;
  v_ms int;
begin
  perform private.player_row(p_match, uid);
  select * into m from matches where id = p_match for update;
  if m.mode = 'friend' or m.status <> 'active' or now() < m.started_at or now() >= m.ends_at then
    return jsonb_build_object('status', 'ignored');
  end if;

  update match_players set focus_strikes = focus_strikes + 1
   where match_id = p_match and user_id = uid
  returning focus_strikes into v_strikes;

  if v_strikes = 1 then return jsonb_build_object('status', 'warning'); end if;

  insert into flags (match_id, user_id, reason) values (p_match, uid, 'tab_switch');
  if p_slot in ('A','B','C')
     and not exists (select 1 from submissions where match_id = p_match and user_id = uid and slot = p_slot) then
    v_ms := floor(extract(epoch from (now() - m.started_at)) * 1000);
    insert into submissions (match_id, user_id, slot, answer, correct, ms_from_start)
    values (p_match, uid, p_slot, null, false, v_ms);
    perform private.finish_if_done(p_match);
    return jsonb_build_object('status', 'forfeited_question', 'slot', p_slot);
  end if;
  return jsonb_build_object('status', 'flagged');
end
$$;

-- Call every ~5s during a match so a disconnect can be detected.
create or replace function public.heartbeat(p_match uuid)
returns timestamptz language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid();
begin
  perform private.player_row(p_match, uid);
  update match_players set last_seen = now() where match_id = p_match and user_id = uid;
  return now();
end
$$;

-- If the opponent hasn't sent a heartbeat for 30s, they forfeit.
create or replace function public.claim_forfeit(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  m public.matches;
  opp public.match_players;
begin
  perform private.player_row(p_match, uid);
  select * into m from matches where id = p_match;
  if m.status <> 'active' or m.mode = 'async' then return jsonb_build_object('status', 'ignored'); end if;
  select * into opp from match_players where match_id = p_match and user_id <> uid;
  if opp.last_seen < now() - interval '30 seconds' then
    perform private.finish_match(p_match, opp.user_id);
    return jsonb_build_object('status', 'opponent_forfeited');
  end if;
  return jsonb_build_object('status', 'opponent_connected');
end
$$;

-- Called by the client when the clock hits zero (or anytime): finishes the match
-- if it's over, then returns the full match state with answers + solutions.
create or replace function public.finish_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid();
begin
  perform private.player_row(p_match, uid);
  perform private.finish_if_done(p_match);
  return public.get_match(p_match);
end
$$;

-- Active match to resume, if any (lobby uses this on load).
create or replace function public.my_active_match()
returns uuid language sql stable security definer set search_path = public, private, pg_temp as $$
  select m.id from public.matches m
    join public.match_players mp on mp.match_id = m.id
   where mp.user_id = private.require_uid() and not mp.is_ghost
     and m.status = 'active' and m.ends_at > now()
   order by m.created_at desc limit 1;
$$;

create or replace function public.report_question(p_match uuid, p_slot text, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid(); v_qid uuid;
begin
  perform private.player_row(p_match, uid);
  select question_id into v_qid from match_questions where match_id = p_match and slot = p_slot;
  if v_qid is null then raise exception 'invalid_slot'; end if;
  insert into reports (reporter_id, match_id, kind, question_id, reason)
  values (uid, p_match, 'question', v_qid, left(coalesce(p_reason, ''), 500));
end
$$;

create or replace function public.report_player(p_match uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid(); v_opp uuid;
begin
  perform private.player_row(p_match, uid);
  select user_id into v_opp from match_players where match_id = p_match and user_id <> uid and not is_ghost;
  if v_opp is null then raise exception 'no_opponent'; end if;
  insert into reports (reporter_id, match_id, kind, reported_user_id, reason)
  values (uid, p_match, 'player', v_opp, left(coalesce(p_reason, ''), 500));
end
$$;

-- Top 100 ranked players (placement done).
create or replace function public.get_leaderboard(p_limit int default 100)
returns table (place bigint, username text, elo int, rank text, wins int, losses int, draws int)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select row_number() over (order by p.elo desc, p.wins desc, p.created_at),
         p.username, p.elo, public.rank_name(p.elo, p.matches_played), p.wins, p.losses, p.draws
    from public.profiles p
   where p.matches_played >= 10
   order by p.elo desc, p.wins desc, p.created_at
   limit least(greatest(p_limit, 1), 100);
$$;

-- Last 10 finished matches for a profile page.
create or replace function public.get_recent_matches(p_username text)
returns table (match_id uuid, mode text, finished_at timestamptz, result text,
               elo_before int, elo_after int, opponent text, score int, opponent_score int)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select m.id, m.mode, m.finished_at, me.result, me.elo_before, me.elo_after,
         op.username, me.score, them.score
    from public.profiles p
    join public.match_players me on me.user_id = p.id and not me.is_ghost
    join public.matches m on m.id = me.match_id and m.status = 'finished'
    left join public.match_players them on them.match_id = m.id and them.user_id <> p.id
    left join public.profiles op on op.id = them.user_id
   where p.username = lower(p_username)
   order by m.finished_at desc
   limit 10;
$$;

-- ---------------------------------------------------------------------
-- Grants: browser gets read on profiles + the functions above. Nothing else.
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant all on all tables in schema public to service_role;

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function
  public.create_profile(text, date),
  public.join_queue(),
  public.leave_queue(),
  public.create_friend_match(),
  public.join_friend_match(text),
  public.get_match(uuid),
  public.submit_answer(uuid, text, text),
  public.focus_event(uuid, text),
  public.heartbeat(uuid),
  public.claim_forfeit(uuid),
  public.finish_match(uuid),
  public.my_active_match(),
  public.report_question(uuid, text, text),
  public.report_player(uuid, text)
to authenticated;

grant execute on function
  public.get_leaderboard(int),
  public.get_recent_matches(text),
  public.rank_name(int, int),
  public.tier_for_elo(int),
  public.normalize_answer(text)
to anon, authenticated;

grant execute on all functions in schema public to service_role;
grant usage on schema private to service_role;
grant all on all functions in schema private to service_role;
