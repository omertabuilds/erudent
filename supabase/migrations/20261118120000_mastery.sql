-- Mastery
--
--   get_mastery(user)   anyone   One row per (topic, tier) the player has answered: attempted, correct.
--                                Defaults to the caller. Counts finished rated duels (ranked + async,
--                                not friend games) and practice. Skips and focus forfeits count as
--                                attempted, not correct. Duel questions left unanswered at time-up
--                                aren't answers, so they don't count.
--
-- Topic and tier come from the question itself, so a re-tiered question moves its history with it.
-- Only finished duels count, so a profile can't show how a match in progress is going.

create function public.get_mastery(p_user uuid default auth.uid())
returns table(topic text, tier int, attempted int, correct int)
language sql stable security definer set search_path = public, private, pg_temp as $$
  with answers as (
    select mq.question_id, s.correct
      from public.submissions s
      join public.matches m          on m.id = s.match_id
      join public.match_players mp   on mp.match_id = s.match_id and mp.user_id = s.user_id
      join public.match_questions mq on mq.match_id = s.match_id and mq.slot = s.slot
     where s.user_id = p_user
       and not mp.is_ghost
       and m.status = 'finished'
       and m.mode in ('ranked', 'async')
    union all
    select a.question_id, a.correct
      from public.practice_attempts a
     where a.user_id = p_user
  )
  select q.topic, q.tier, count(*)::int, (count(*) filter (where a.correct))::int
    from answers a
    join public.questions q on q.id = a.question_id
   group by q.topic, q.tier
   order by q.topic, q.tier;
$$;

revoke execute on function public.get_mastery(uuid) from public;
grant execute on function public.get_mastery(uuid) to anon, authenticated, service_role;
