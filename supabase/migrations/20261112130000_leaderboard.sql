-- Leaderboard
--
--   get_leaderboard(limit, tier)  anyone  Top players past placement (10 ranked duels).
--                                         Place is always the global place; tier only filters.
--   get_player_place(name)        anyone  One player's global place, or null while unplaced.

drop function if exists public.get_leaderboard(int);

create function public.get_leaderboard(p_limit int default 100, p_tier int default null)
returns table(place bigint, username text, elo int, rank text, wins int, losses int, draws int)
language sql stable security definer set search_path = public, private, pg_temp as $$
  with placed as (
    select row_number() over (order by p.elo desc, p.wins desc, p.created_at) as place, p.*
      from public.profiles p
     where p.matches_played >= 10
  )
  select place, username, elo, public.rank_name(elo, matches_played), wins, losses, draws
    from placed
   where p_tier is null or public.tier_for_elo(elo) = p_tier
   order by place
   limit least(greatest(p_limit, 1), 100);
$$;

create function public.get_player_place(p_username text)
returns bigint
language sql stable security definer set search_path = public, private, pg_temp as $$
  select place from (
    select row_number() over (order by p.elo desc, p.wins desc, p.created_at) as place, p.username
      from public.profiles p
     where p.matches_played >= 10
  ) placed
   where lower(username) = lower(p_username);
$$;

revoke execute on function public.get_leaderboard(int, int), public.get_player_place(text) from public;
grant execute on function public.get_leaderboard(int, int), public.get_player_place(text) to anon, authenticated;
