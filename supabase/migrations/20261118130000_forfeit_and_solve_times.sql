-- Duels: forfeit button, exact solve times
--
--   forfeit_match(match)   player   Ends an in-progress duel: a loss for the caller, a win for the
--                                   opponent, Elo as usual (rated modes only). Works during the
--                                   countdown too. Returns {status}: forfeited | time_up | match_over
--                                   | not_started (friend duel nobody has joined: just leave).
--
--   get_match(match)       player   Now also returns:
--                                     resigned             true when forfeited_by forfeited on purpose
--                                                          (false = they disconnected)
--                                     me.answers[].answered_at
--                                     opponent.solved_at   {slot: time} for the slots in `solved`.
--                                                          Recorded runs: start + the run's own time,
--                                                          revealed on the same schedule as `solved`.
--
-- Solve times were tracked by the browser between polls (approximate, lost on reload). These are
-- the server's stamps. Nothing new is revealed about the opponent: only when, never what.

alter table public.matches add column resigned boolean not null default false;

create function public.forfeit_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  m public.matches;
begin
  perform private.player_row(p_match, uid); -- raises not_participant
  select * into m from matches where id = p_match for update;
  if m.status = 'waiting' then return jsonb_build_object('status', 'not_started'); end if;
  if m.status <> 'active' then return jsonb_build_object('status', 'match_over'); end if;
  if now() >= m.ends_at then
    -- The clock already decided it: score it normally.
    perform private.finish_match(p_match, null);
    return jsonb_build_object('status', 'time_up');
  end if;
  perform private.finish_match(p_match, uid);
  update matches set resigned = true where id = p_match;
  return jsonb_build_object('status', 'forfeited');
end
$$;

-- Same wrapper as 20261110180000_match_cards, plus resigned and the solve times.
create or replace function public.get_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v jsonb := private.get_match_base(p_match); -- raises not_participant for outsiders
  uid uuid := auth.uid();
  m public.matches;
  v_opp uuid;
  v_elapsed_ms bigint;
  v_answers jsonb;
  v_solved_at jsonb;
begin
  select * into m from matches where id = p_match;
  select user_id into v_opp from match_players where match_id = p_match and user_id <> uid;
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
                   (v -> 'opponent') || jsonb_build_object('solved_at', v_solved_at) || coalesce(private.player_card(v_opp), '{}'));
  end if;
  return v;
end
$$;

revoke all on function public.forfeit_match(uuid), public.get_match(uuid) from public, anon, authenticated;
grant execute on function public.forfeit_match(uuid), public.get_match(uuid) to authenticated;
grant execute on function public.forfeit_match(uuid), public.get_match(uuid) to service_role;
