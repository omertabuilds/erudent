-- Abandoned-match sweeper
--
-- A duel only ends when someone calls into it (an answer, the clock check, claim_forfeit, or
-- join_queue's clean-up). If both players leave, it stayed 'active' past ends_at with no result
-- and no Elo change, possibly forever. Now a pg_cron job settles those every minute:
--
--   private.sweep_abandoned_matches()   cron, every minute   Settles every 'active' match past
--                                                            ends_at. Returns how many it settled.
--     - at least one answer (skips count) from a live player → private.finish_match(match, null),
--       scored exactly as if the clock had been checked: points, tiebreak, Elo.
--     - ranked or friend duel where neither player submitted anything → status 'void':
--       no result, no Elo change, no games played added, questions not marked seen.
--       Recorded runs (async) are always scored: the recorded side did play.
--
-- Re-running is a no-op: only 'active' rows are touched, and each is locked (skip locked) so a
-- player's own finish_match at the same moment can't double-settle it.

alter table public.matches drop constraint matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('waiting', 'active', 'finished', 'void'));

create function private.sweep_abandoned_matches()
returns int language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  m public.matches;
  v_n int := 0;
begin
  for m in
    select * from matches
     where status = 'active' and ends_at < now()
     order by ends_at
     for update skip locked
  loop
    if m.mode <> 'async'
       and not exists (select 1 from submissions s
                         join match_players p on p.match_id = s.match_id and p.user_id = s.user_id and not p.is_ghost
                        where s.match_id = m.id) then
      update matches set status = 'void', finished_at = now() where id = m.id;
      update match_players set elo_after = elo_before where match_id = m.id and not is_ghost;
    else
      perform private.finish_match(m.id, null);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

revoke all on function private.sweep_abandoned_matches() from public, anon, authenticated;
grant execute on function private.sweep_abandoned_matches() to service_role;

-- Supabase: pg_cron lives in pg_catalog, jobs in cron.job. Re-scheduling a name replaces the job.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('sweep-abandoned-matches', '* * * * *', 'select private.sweep_abandoned_matches()');
