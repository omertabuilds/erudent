-- Duels: opponent presence
--
--   get_match(match)       player   Now also returns:
--                                     opponent.last_seen   greatest(their last heartbeat, match start):
--                                                          the moment claim_forfeit counts its 30s from.
--                                                          null for recorded runs (no heartbeat).
--
-- The duel screen shows "Opponent disconnected" from this, so the countdown to the forfeit is the
-- server's, not a browser timer, and survives a reload. Nothing about answers is revealed.

-- Same wrapper as 20261118130000_forfeit_and_solve_times, plus opponent.last_seen.
create or replace function public.get_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v jsonb := private.get_match_base(p_match); -- raises not_participant for outsiders
  uid uuid := auth.uid();
  m public.matches;
  opp public.match_players;
  v_opp uuid;
  v_elapsed_ms bigint;
  v_answers jsonb;
  v_solved_at jsonb;
begin
  select * into m from matches where id = p_match;
  select * into opp from match_players where match_id = p_match and user_id <> uid;
  v_opp := opp.user_id;
  v_elapsed_ms := case when m.started_at is null then 0
                       else greatest(0, floor(extract(epoch from (now() - m.started_at)) * 1000)) end;

  select coalesce(jsonb_agg(jsonb_build_object('slot', s.slot, 'answer', s.answer, 'correct', s.correct,
                                               'answered_at', s.submitted_at) order by s.slot), '[]')
    into v_answers
    from submissions s where s.match_id = p_match and s.user_id = uid;

  if m.mode = 'async' then
    select coalesce(jsonb_object_agg(s.slot, m.started_at + make_interval(secs => s.ms_from_start / 1000.0)), '{}')
      into v_solved_at
      from submissions s
     where s.match_id = m.source_match_id and s.user_id = m.ghost_user_id and s.correct
       and (m.status = 'finished' or s.ms_from_start <= v_elapsed_ms);
  else
    select coalesce(jsonb_object_agg(s.slot, s.submitted_at), '{}')
      into v_solved_at
      from submissions s
     where s.match_id = p_match and s.user_id = v_opp and s.correct;
  end if;

  v := v || jsonb_build_object('resigned', m.resigned);
  v := jsonb_set(v, '{me}', (v -> 'me') || jsonb_build_object('answers', v_answers) || coalesce(private.player_card(uid), '{}'));
  if jsonb_typeof(v -> 'opponent') = 'object' then
    v := jsonb_set(v, '{opponent}',
                   (v -> 'opponent')
                   || jsonb_build_object('solved_at', v_solved_at,
                                         'last_seen', case when m.mode = 'async' or opp.is_ghost then null
                                                           else greatest(opp.last_seen, m.started_at) end)
                   || coalesce(private.player_card(v_opp), '{}'));
  end if;
  return v;
end
$$;

revoke all on function public.get_match(uuid) from public, anon, authenticated;
grant execute on function public.get_match(uuid) to authenticated;
grant execute on function public.get_match(uuid) to service_role;
