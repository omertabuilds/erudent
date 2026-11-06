-- =====================================================================
-- Early access gate
--
-- Playing needs a redeemed invitation code. Without one:
--   - the app sends signed-in players back to the landing page (requirePlayer), and
--   - the database refuses with 'no_access' anything that starts or plays a duel:
--     joining the ranked queue, creating or joining a friend match, getting a
--     recorded run, submitting an answer. Recorded runs (ghosts) of anyone still replay.
--
--   has_access()   signed in   True once you've redeemed an invitation code.
--
-- access_codes stays unreadable from the browser: has_access only answers for the caller.
-- =====================================================================

create or replace function private.user_has_access(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists (select 1 from public.access_codes where redeemed_by = p_uid);
$$;

create or replace function public.has_access()
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.user_has_access(auth.uid());
$$;

-- Every way into a duel writes one of these rows for the player, so this is the one place to check.
create or replace function private.require_access()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if not private.user_has_access(new.user_id) then raise exception 'no_access'; end if;
  return new;
end
$$;

-- Named to fire before the username checks (triggers run in name order): no code is the first thing to fix.
create trigger queue_require_access
  before insert or update on public.queue
  for each row execute function private.require_access();

create trigger match_players_require_access
  before insert on public.match_players
  for each row when (not new.is_ghost) execute function private.require_access();

create trigger submissions_require_access
  before insert on public.submissions
  for each row execute function private.require_access();

-- Players already queued without a code would otherwise get paired.
delete from public.queue q where not private.user_has_access(q.user_id);

revoke all on function
  public.has_access(),
  private.user_has_access(uuid),
  private.require_access()
from public, anon, authenticated;
grant execute on function public.has_access() to authenticated;
grant execute on function public.has_access(), private.user_has_access(uuid), private.require_access() to service_role;
