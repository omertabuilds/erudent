-- Fix: in friend games the host's last_seen was set when the game was created,
-- so waiting in the lobby for 30s+ counted as a disconnect the moment a friend joined.
-- Silence now counts from the later of last heartbeat and match start.
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
  if greatest(opp.last_seen, m.started_at) < now() - interval '30 seconds' then
    perform private.finish_match(p_match, opp.user_id);
    return jsonb_build_object('status', 'opponent_forfeited');
  end if;
  return jsonb_build_object('status', 'opponent_connected');
end
$$;
