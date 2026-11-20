-- Void moves into finish_match
--
-- 20261120120000 voided abandoned duels only from the sweeper, so a player who came back after
-- time-up (before the sweeper's next run) still got a 0–0 draw that moved Elo. Now
-- private.finish_match decides: a ranked or friend duel that ends without a forfeit and without a
-- single submission from either player becomes 'void'. Every path that ends a duel goes through
-- it (the clock check, join_queue's clean-up, the sweeper), so they all agree.
--
-- Unchanged: forfeits and disconnects are scored even with no answers; recorded runs never void.
-- The body below is 20261105000000_core's, plus the void branch.

create or replace function private.finish_match(p_match uuid, p_forfeit uuid)
returns void language plpgsql set search_path = public, private, pg_temp as $$
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

  -- Nobody answered anything in a live duel that ended on time: void. No result, no Elo,
  -- no games played, questions not marked seen. Forfeits are still scored (the leaver loses),
  -- and recorded runs always count: the recorded side did play.
  if p_forfeit is null and m.mode <> 'async'
     and not exists (select 1 from public.submissions s
                       join public.match_players lp on lp.match_id = s.match_id and lp.user_id = s.user_id and not lp.is_ghost
                      where s.match_id = p_match) then
    update public.matches set status = 'void', finished_at = now() where id = p_match;
    update public.match_players set elo_after = elo_before where match_id = p_match and not is_ghost;
    return;
  end if;

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

-- The sweeper now just finishes every overdue active match; finish_match decides void or scored.
create or replace function private.sweep_abandoned_matches()
returns int language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  m_id uuid;
  v_n int := 0;
begin
  for m_id in
    select id from matches
     where status = 'active' and ends_at < now()
     order by ends_at
     for update skip locked
  loop
    perform private.finish_match(m_id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;
