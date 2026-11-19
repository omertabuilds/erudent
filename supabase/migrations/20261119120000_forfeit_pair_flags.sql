-- Forfeit-abuse flag
--
-- When a rated duel ends by forfeit (on purpose or by disconnect) and the same two players
-- have now had 2+ forfeited rated duels within 24 hours, either way round, write a row to
-- public.flags for review. No penalty: nothing about the match or Elo changes.
--
--   flags.user_id = who forfeited this match
--   flags.reason  = 'forfeit_pair:<other player id>:<forfeits in 24h>'
--
-- Every forfeit from the 2nd on gets its own row, so a run of them stays visible.
-- Friend duels don't count (no Elo to trade), nor do recorded runs (no second player).

create function private.flag_forfeit_pair()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_other uuid;
  v_n int;
begin
  if new.mode not in ('ranked', 'async') then return null; end if;
  select user_id into v_other from match_players
   where match_id = new.id and user_id <> new.forfeited_by and not is_ghost;
  if v_other is null then return null; end if;

  select count(*) into v_n
    from matches m
   where m.forfeited_by is not null
     and m.mode in ('ranked', 'async')
     and m.finished_at >= now() - interval '24 hours'
     and exists (select 1 from match_players p where p.match_id = m.id and p.user_id = new.forfeited_by and not p.is_ghost)
     and exists (select 1 from match_players p where p.match_id = m.id and p.user_id = v_other and not p.is_ghost);

  if v_n >= 2 then
    insert into flags (match_id, user_id, reason)
    values (new.id, new.forfeited_by, format('forfeit_pair:%s:%s', v_other, v_n));
  end if;
  return null;
end
$$;

create trigger matches_flag_forfeit_pair
  after update of forfeited_by on public.matches
  for each row when (old.forfeited_by is null and new.forfeited_by is not null)
  execute function private.flag_forfeit_pair();

revoke all on function private.flag_forfeit_pair() from public, anon, authenticated;
grant execute on function private.flag_forfeit_pair() to service_role;
