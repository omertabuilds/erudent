-- =====================================================================
-- Practice mode
--
-- Solo, unrated, endless. One question at a time: answer (or skip), see the
-- answer and solution, then ask for the next one. No timer, no focus mode,
-- and Elo / matches_played are never touched.
--
--   next_practice_question(tier)   signed in   The question to answer. Same one until it's answered or skipped.
--   submit_practice_answer(answer) signed in   Marks it, then reveals answer + solution.
--   skip_practice_question()       signed in   Gives up on it (counts as wrong), reveals answer + solution.
--   practice_stats()               signed in   Totals, streaks, per-tier counts, and the saved tier setting.
--   report_practice_question(q, reason) signed in   Only for a question you've attempted in practice.
--
-- Same rules as duels: answers stay in the database until the player has used
-- their attempt, the server marks answers, and both tables are unreadable from
-- the browser. Every revealed question goes into seen_questions so ranked
-- matchmaking steers away from questions whose answers the player has seen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.practice_state (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  current_question_id uuid references public.questions(id) on delete set null,  -- served, not yet answered
  current_tier        int  not null check (current_tier between 1 and 6),       -- tier of the next question
  auto_tier           boolean not null default true,
  streak              int  not null default 0,   -- correct answers in a row
  best_streak         int  not null default 0,
  tier_run            int  not null default 0,   -- correct in a row at current_tier (auto moves up at 2)
  served_at           timestamptz
);

create table public.practice_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  tier        int  not null check (tier between 1 and 6),
  answer      text,                      -- null = skipped
  correct     boolean not null,
  created_at  timestamptz not null default now()
);

create index on public.practice_attempts (user_id, created_at);
create index on public.practice_attempts (user_id, question_id);  -- "has this player tried it?" when picking

alter table public.practice_state    enable row level security;
alter table public.practice_attempts enable row level security;

-- Practice reports have no match. Player reports still need one.
alter table public.reports alter column match_id drop not null;
alter table public.reports add constraint reports_player_needs_match check (kind = 'question' or match_id is not null);

-- ---------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------

-- The caller, if they're allowed to practice. Same gates as duels, plus: not while a duel
-- is in progress, or practice could reveal the answer to a question on their match screen.
create or replace function private.practice_player()
returns uuid language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid();
begin
  if not private.user_has_access(uid) then raise exception 'no_access'; end if;
  if not exists (select 1 from profiles where id = uid) then raise exception 'no_profile'; end if;
  if exists (select 1 from private.username_flags where user_id = uid) then raise exception 'needs_rename'; end if;
  if exists (select 1 from matches m join match_players mp on mp.match_id = m.id
              where mp.user_id = uid and not mp.is_ghost and m.status = 'active' and m.ends_at > now()) then
    raise exception 'in_match';
  end if;
  return uid;
end
$$;

-- A question at this tier: first ones the player has never seen (practice or duels),
-- then the one they practiced longest ago. Null if the tier is empty.
create or replace function private.pick_practice_question(p_uid uuid, p_tier int)
returns uuid language sql security definer set search_path = public, private, pg_temp as $$
  select q.id
    from public.questions q
    left join lateral (
      select max(a.created_at) as last_at
        from public.practice_attempts a
       where a.user_id = p_uid and a.question_id = q.id) pa on true
   where q.active and q.tier = p_tier
   order by (pa.last_at is not null
             or exists (select 1 from public.seen_questions s where s.user_id = p_uid and s.question_id = q.id)),
            pa.last_at nulls first,
            random()
   limit 1;
$$;

-- Records the attempt on the served question, moves the tier, reveals the answer.
-- p_answer is the normalized answer, or null for a skip.
create or replace function private.record_practice(p_state public.practice_state, p_q public.questions, p_answer text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_ok boolean := p_answer is not null and p_answer = p_q.answer;
  v_streak int := case when v_ok then p_state.streak + 1 else 0 end;
  v_tier int := p_state.current_tier;
  v_run int := case when v_ok then p_state.tier_run + 1 else 0 end;
begin
  if p_state.auto_tier then
    if v_ok and v_run >= 2 and v_tier < 6 then
      v_tier := v_tier + 1;
      v_run := 0;
    elsif not v_ok then
      v_tier := greatest(1, v_tier - 1);
    end if;
  end if;

  insert into practice_attempts (user_id, question_id, tier, answer, correct)
  values (p_state.user_id, p_q.id, p_q.tier, p_answer, v_ok);

  insert into seen_questions (user_id, question_id) values (p_state.user_id, p_q.id)
  on conflict do nothing;

  update practice_state
     set current_question_id = null, served_at = null,
         streak = v_streak, best_streak = greatest(best_streak, v_streak),
         current_tier = v_tier, tier_run = v_run
   where user_id = p_state.user_id;

  return jsonb_build_object(
    'status', 'ok', 'correct', v_ok, 'answer', p_q.answer, 'solution', p_q.solution,
    'streak', v_streak, 'tier', v_tier);
end
$$;

-- ---------------------------------------------------------------------
-- Public functions (called from the app)
-- ---------------------------------------------------------------------

-- p_tier null = auto: starts at your Elo's tier, 2 right in a row moves up, a miss moves down.
-- p_tier 1–6 = stay on that tier. The setting is saved, but a question already on screen
-- comes back until it's answered or skipped, so changing tier can't reroll it.
create or replace function public.next_practice_question(p_tier int default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.practice_player();
  st public.practice_state;
  q public.questions;
  v_qid uuid;
  v_elo_tier int;
begin
  if p_tier is not null and p_tier not between 1 and 6 then raise exception 'invalid_tier'; end if;
  select public.tier_for_elo(elo) into v_elo_tier from profiles where id = uid;

  insert into practice_state (user_id, current_tier, auto_tier)
  values (uid, coalesce(p_tier, v_elo_tier), p_tier is null)
  on conflict (user_id) do nothing;
  select * into st from practice_state where user_id = uid for update;

  if p_tier is not null and (st.auto_tier or st.current_tier <> p_tier) then
    update practice_state set auto_tier = false, current_tier = p_tier, tier_run = 0
     where user_id = uid returning * into st;
  elsif p_tier is null and not st.auto_tier then
    update practice_state set auto_tier = true, current_tier = v_elo_tier, tier_run = 0
     where user_id = uid returning * into st;
  end if;

  if st.current_question_id is not null then
    select * into q from questions where id = st.current_question_id and active;
  end if;
  if q.id is null then
    -- Into a variable first: the picker is random, so inline in a WHERE it would run once per row.
    v_qid := private.pick_practice_question(uid, st.current_tier);
    if v_qid is null then raise exception 'no_questions_for_tier %', st.current_tier; end if;
    select * into q from questions where id = v_qid;
    update practice_state set current_question_id = q.id, served_at = now() where user_id = uid;
  end if;

  -- Never the answer or solution.
  return jsonb_build_object(
    'question_id', q.id, 'tier', q.tier, 'topic', q.topic, 'prompt', q.prompt,
    'auto', st.auto_tier, 'selected_tier', st.current_tier);
end
$$;

-- Wrong format doesn't use up the question.
create or replace function public.submit_practice_answer(p_answer text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.practice_player();
  st public.practice_state;
  q public.questions;
  v_norm text;
begin
  select * into st from practice_state where user_id = uid for update;
  if st.current_question_id is null then return jsonb_build_object('status', 'no_question'); end if;
  v_norm := public.normalize_answer(p_answer);
  if v_norm is null then return jsonb_build_object('status', 'invalid_format'); end if;
  select * into q from questions where id = st.current_question_id;
  return private.record_practice(st, q, v_norm);
end
$$;

-- Counts as wrong (streak and auto tier), and shows the answer.
create or replace function public.skip_practice_question()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.practice_player();
  st public.practice_state;
  q public.questions;
begin
  select * into st from practice_state where user_id = uid for update;
  if st.current_question_id is null then return jsonb_build_object('status', 'no_question'); end if;
  select * into q from questions where id = st.current_question_id;
  return private.record_practice(st, q, null);
end
$$;

-- All-time practice numbers (skips count as attempted, not correct), plus the saved
-- tier setting so the page can carry on in the mode the player left it in.
create or replace function public.practice_stats()
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  st public.practice_state;
  v_attempted int;
  v_correct int;
  v_by_tier jsonb;
begin
  select * into st from practice_state where user_id = uid;
  select count(*), count(*) filter (where correct) into v_attempted, v_correct
    from practice_attempts where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'attempted', n, 'correct', c) order by tier), '[]')
    into v_by_tier
    from (select tier, count(*) as n, count(*) filter (where correct) as c
            from practice_attempts where user_id = uid group by tier) t;
  return jsonb_build_object(
    'attempted', v_attempted, 'correct', v_correct,
    'streak', coalesce(st.streak, 0), 'best_streak', coalesce(st.best_streak, 0),
    'auto', coalesce(st.auto_tier, true), 'tier', st.current_tier,
    'by_tier', v_by_tier);
end
$$;

-- One open report per player per question; reporting again is a quiet no-op.
create or replace function public.report_practice_question(p_question uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid();
begin
  if not exists (select 1 from practice_attempts where user_id = uid and question_id = p_question) then
    raise exception 'not_attempted';
  end if;
  if exists (select 1 from reports where reporter_id = uid and question_id = p_question
                                     and match_id is null and not resolved) then
    return;
  end if;
  insert into reports (reporter_id, match_id, kind, question_id, reason)
  values (uid, null, 'question', p_question, left(coalesce(p_reason, ''), 500));
end
$$;

-- ---------------------------------------------------------------------
-- Grants. New tables and functions are open by default, so close them first.
-- ---------------------------------------------------------------------

revoke all on public.practice_state, public.practice_attempts from public, anon, authenticated;
grant all on public.practice_state, public.practice_attempts to service_role;

revoke all on function
  private.practice_player(),
  private.pick_practice_question(uuid, int),
  private.record_practice(public.practice_state, public.questions, text),
  public.next_practice_question(int),
  public.submit_practice_answer(text),
  public.skip_practice_question(),
  public.practice_stats(),
  public.report_practice_question(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.next_practice_question(int),
  public.submit_practice_answer(text),
  public.skip_practice_question(),
  public.practice_stats(),
  public.report_practice_question(uuid, text)
to authenticated;

grant execute on function
  private.practice_player(),
  private.pick_practice_question(uuid, int),
  private.record_practice(public.practice_state, public.questions, text),
  public.next_practice_question(int),
  public.submit_practice_answer(text),
  public.skip_practice_question(),
  public.practice_stats(),
  public.report_practice_question(uuid, text)
to service_role;
