-- Ghost runs from async matches too
--
-- A player's run against a ghost is a real run, so it can be someone else's
-- ghost later. Before this, only live ranked matches were recorded, and with
-- few players online almost every match is async, so the ghost pool barely grew.
-- An async run counts only if the player answered at least one question.

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
   where m.mode in ('ranked', 'async') and m.status = 'finished' and m.forfeited_by is null
     and mp.user_id <> p_uid
     and abs(mp.elo_before - v_elo) <= 400
     and (m.mode = 'ranked' or exists (
       select 1 from public.submissions s where s.match_id = m.id and s.user_id = mp.user_id))
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

revoke execute on function private.create_async_match(uuid) from public, anon, authenticated;
