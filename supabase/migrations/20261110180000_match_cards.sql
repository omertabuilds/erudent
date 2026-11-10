-- Player cards on the duel screen: get_match also returns each player's public profile style.
--
-- Adds to `me` and `opponent`: banner, accent, avatar_path, wins, losses, draws.
-- All of it is already public (anyone can read profiles); this only saves the duel screen a
-- second round trip. Nothing about answers changes: the opponent still shows only `solved`.
--
-- The existing get_match is kept byte for byte: it moves to private.get_match_base, and the new
-- public.get_match calls it and merges the card fields in. finish_match calls public.get_match
-- by name, so it returns the cards too.

alter function public.get_match(uuid) rename to get_match_base;
alter function public.get_match_base(uuid) set schema private;
revoke all on function private.get_match_base(uuid) from public, anon, authenticated;

create function private.player_card(p_user uuid)
returns jsonb language sql stable security definer set search_path = public, private, pg_temp as $$
  select jsonb_build_object(
    'banner', p.banner, 'accent', p.accent, 'avatar_path', p.avatar_path,
    'wins', p.wins, 'losses', p.losses, 'draws', p.draws)
    from profiles p where p.id = p_user;
$$;
revoke all on function private.player_card(uuid) from public, anon, authenticated;

create function public.get_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v jsonb := private.get_match_base(p_match); -- raises not_participant for outsiders
  v_opp uuid;
begin
  select user_id into v_opp from match_players where match_id = p_match and user_id <> auth.uid();
  v := jsonb_set(v, '{me}', (v -> 'me') || coalesce(private.player_card(auth.uid()), '{}'));
  if jsonb_typeof(v -> 'opponent') = 'object' then
    v := jsonb_set(v, '{opponent}', (v -> 'opponent') || coalesce(private.player_card(v_opp), '{}'));
  end if;
  return v;
end
$$;

revoke all on function public.get_match(uuid) from public, anon, authenticated;
grant execute on function public.get_match(uuid) to authenticated;
grant execute on all functions in schema public to service_role;
grant all on all functions in schema private to service_role;
