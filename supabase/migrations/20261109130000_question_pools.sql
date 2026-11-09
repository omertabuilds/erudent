-- =====================================================================
-- Question pools
--
-- Practice reveals answers, so it can't draw from the questions ranked depends on.
--   ranked    duels and recorded-run replays only. Answers shown only after a match.
--   practice  practice mode only. Written for practice, or retired from ranked.
--
-- Existing questions are all ranked. Practice serves nothing until practice questions load.
-- Recorded runs that use a question no longer active in the ranked pool are no longer replayed.
-- =====================================================================

alter table public.questions
  add column pool text not null default 'ranked'
  check (pool in ('ranked','practice'));
create index questions_pool_tier on public.questions (pool, tier) where active;

-- Ranked matches: ranked pool only.
create or replace function private.pick_questions(p_match uuid, p_tier int, p_users uuid[])
returns void language plpgsql set search_path = public, private, pg_temp as $$
declare
  i int;
  v_tier int;
  v_qid uuid;
begin
  for i in 1..3 loop
    v_tier := least(6, greatest(1, p_tier + i - 2));
    select q.id into v_qid
      from public.questions q
     where q.active and q.pool = 'ranked' and q.tier = v_tier
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

-- Recorded-run replays: skip any run that uses a question no longer active in the ranked pool.
create or replace function private.create_async_match(p_uid uuid)
returns uuid language plpgsql set search_path = public, private, pg_temp as $$
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
     and not exists (
       select 1 from public.match_questions mq
         join public.questions q on q.id = mq.question_id
        where mq.match_id = m.id and (q.pool <> 'ranked' or not q.active))
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

-- Practice: practice pool only.
create or replace function private.pick_practice_question(p_uid uuid, p_tier int)
returns uuid language sql security definer set search_path = public, private, pg_temp as $$
  select q.id
    from public.questions q
    left join lateral (
      select max(a.created_at) as last_at
        from public.practice_attempts a
       where a.user_id = p_uid and a.question_id = q.id) pa on true
   where q.active and q.pool = 'practice' and q.tier = p_tier
   order by (pa.last_at is not null
             or exists (select 1 from public.seen_questions s where s.user_id = p_uid and s.question_id = q.id)),
            pa.last_at nulls first,
            random()
   limit 1;
$$;

revoke all on function
  private.pick_questions(uuid, int, uuid[]),
  private.create_async_match(uuid),
  private.pick_practice_question(uuid, int)
from public, anon, authenticated;
