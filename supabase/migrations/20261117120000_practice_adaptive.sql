-- =====================================================================
-- Practice: smoother auto tier + a tier range
--
-- Before: 2 right in a row moved auto up a tier, 1 miss moved it down. Tiers are big
-- steps, so most players bounced every 2–3 questions (easy, easy, hard, miss, easy,
-- easy, hard...). A tester called it "3 easy ones then a curveball".
--
-- Now auto keeps a practice level, a decimal like 2.40 (tier 2, 40% of the way to
-- tier 3). Each answer nudges it, Elo-style:
--
--   expected = 1 / (1 + e^(-2 · (level − tier)))     how likely a right answer was
--   level   += 0.6 · (result − expected)             result: 1 right, 0 wrong or skipped
--
-- A right answer that was likely moves you a little; a surprise moves you a lot.
-- Auto moves up when level reaches the next tier, and down only once level drops
-- 0.4 below the current one, so one miss right after moving up doesn't bounce you
-- straight back (it takes two). Simulated over 40 questions: about 4–5 tier changes instead of 22,
-- accuracy around 60–80%. Six right in a row from a fresh tier moves you up.
--
-- The range (min_tier..max_tier, default 1..6) caps where auto can go, e.g. Scholar
-- to Sage. Fixed tier ignores the range and doesn't move level.
-- =====================================================================

alter table public.practice_state
  add column level    numeric(4,2),
  add column min_tier int not null default 1,
  add column max_tier int not null default 6;

update public.practice_state set level = current_tier + 0.25;

alter table public.practice_state
  alter column level set not null,
  add constraint practice_level_bounds check (level >= 1 and level < 7),
  add constraint practice_range check (min_tier between 1 and 6 and max_tier between min_tier and 6),
  drop column tier_run;

-- ---------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------

-- Level after one answer at p_tier, kept inside the range.
create or replace function private.practice_next_level(p_level numeric, p_tier int, p_ok boolean, p_min int, p_max int)
returns numeric language sql immutable set search_path = pg_temp as $$
  select least(p_max + 0.99, greatest(p_min::numeric,
           round(p_level + 0.6 * ((case when p_ok then 1 else 0 end)
                                  - 1 / (1 + exp(-2 * (p_level - p_tier)))), 2)));
$$;

-- Tier for a level, starting from the current tier: up once level reaches the next
-- tier, down only past a 0.4 cushion. Always inside the range.
create or replace function private.practice_tier_for(p_level numeric, p_current int, p_min int, p_max int)
returns int language plpgsql immutable set search_path = pg_temp as $$
declare t int := least(p_max, greatest(p_min, p_current));
begin
  while t < p_max and p_level >= t + 1 loop t := t + 1; end loop;
  while t > p_min and p_level < t - 0.4 loop t := t - 1; end loop;
  return t;
end
$$;

-- Records the attempt on the served question, moves the level and tier, reveals the answer.
-- p_answer is the normalized answer, or null for a skip.
create or replace function private.record_practice(p_state public.practice_state, p_q public.questions, p_answer text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_ok boolean := p_answer is not null and p_answer = p_q.answer;
  v_streak int := case when v_ok then p_state.streak + 1 else 0 end;
  v_tier int := p_state.current_tier;
  v_level numeric := p_state.level;
begin
  if p_state.auto_tier then
    v_level := private.practice_next_level(p_state.level, p_q.tier, v_ok, p_state.min_tier, p_state.max_tier);
    v_tier := private.practice_tier_for(v_level, p_state.current_tier, p_state.min_tier, p_state.max_tier);
  end if;

  insert into practice_attempts (user_id, question_id, tier, answer, correct)
  values (p_state.user_id, p_q.id, p_q.tier, p_answer, v_ok);

  insert into seen_questions (user_id, question_id) values (p_state.user_id, p_q.id)
  on conflict do nothing;

  update practice_state
     set current_question_id = null, served_at = null,
         streak = v_streak, best_streak = greatest(best_streak, v_streak),
         current_tier = v_tier, level = v_level
   where user_id = p_state.user_id;

  return jsonb_build_object(
    'status', 'ok', 'correct', v_ok, 'answer', p_q.answer, 'solution', p_q.solution,
    'streak', v_streak, 'tier', v_tier,
    'progress', case when p_state.auto_tier then private.practice_progress(v_level, v_tier) end);
end
$$;

-- How far toward the next tier, 0–1. Shown as a bar in auto (null on a fixed tier).
create or replace function private.practice_progress(p_level numeric, p_tier int)
returns numeric language sql immutable set search_path = pg_temp as $$
  select round(least(1, greatest(0, p_level - p_tier)), 2);
$$;

-- ---------------------------------------------------------------------
-- Public functions
-- ---------------------------------------------------------------------

-- p_tier 1–6 = stay on that tier.
-- p_tier null = auto, inside p_min..p_max. Range nulls keep the saved range (1–6 at first).
-- First time: starts at your Elo's tier. Switching back to auto carries on from your level.
-- A question already on screen comes back until it's answered or skipped, so changing
-- the setting can't reroll it.
drop function public.next_practice_question(int);
create or replace function public.next_practice_question(p_tier int default null, p_min int default null, p_max int default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.practice_player();
  st public.practice_state;
  q public.questions;
  v_qid uuid;
  v_elo_tier int;
  v_min int;
  v_max int;
  v_level numeric;
begin
  if p_tier is not null and p_tier not between 1 and 6 then raise exception 'invalid_tier'; end if;
  if (p_min is not null and p_min not between 1 and 6) or (p_max is not null and p_max not between 1 and 6) then
    raise exception 'invalid_tier';
  end if;
  select public.tier_for_elo(elo) into v_elo_tier from profiles where id = uid;

  insert into practice_state (user_id, current_tier, auto_tier, level)
  values (uid, coalesce(p_tier, v_elo_tier), p_tier is null, v_elo_tier + 0.25)
  on conflict (user_id) do nothing;
  select * into st from practice_state where user_id = uid for update;

  if p_tier is not null then
    if st.auto_tier or st.current_tier <> p_tier then
      update practice_state set auto_tier = false, current_tier = p_tier
       where user_id = uid returning * into st;
    end if;
  else
    v_min := coalesce(p_min, st.min_tier);
    v_max := coalesce(p_max, st.max_tier);
    if v_min > v_max then raise exception 'invalid_range'; end if;
    if not st.auto_tier or v_min <> st.min_tier or v_max <> st.max_tier then
      -- Level stays where your answers put it, just pulled inside the range.
      v_level := least(v_max + 0.99, greatest(v_min::numeric, st.level));
      update practice_state
         set auto_tier = true, min_tier = v_min, max_tier = v_max, level = v_level,
             current_tier = least(v_max, greatest(v_min, floor(v_level)::int))
       where user_id = uid returning * into st;
    end if;
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
    'auto', st.auto_tier, 'selected_tier', st.current_tier,
    'min_tier', st.min_tier, 'max_tier', st.max_tier,
    'progress', case when st.auto_tier then private.practice_progress(st.level, st.current_tier) end);
end
$$;

-- All-time practice numbers, plus the saved setting so the page can carry on where you left it.
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
    'min_tier', coalesce(st.min_tier, 1), 'max_tier', coalesce(st.max_tier, 6),
    'by_tier', v_by_tier);
end
$$;

-- ---------------------------------------------------------------------
-- Grants. New functions are open by default, so close them first.
-- ---------------------------------------------------------------------

revoke all on function
  private.practice_next_level(numeric, int, boolean, int, int),
  private.practice_tier_for(numeric, int, int, int),
  private.practice_progress(numeric, int),
  public.next_practice_question(int, int, int)
from public, anon, authenticated;

grant execute on function public.next_practice_question(int, int, int) to authenticated;

grant execute on function
  private.practice_next_level(numeric, int, boolean, int, int),
  private.practice_tier_for(numeric, int, int, int),
  private.practice_progress(numeric, int),
  public.next_practice_question(int, int, int)
to service_role;
