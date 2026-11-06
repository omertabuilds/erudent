-- Pin search_path on every function that didn't set one (Supabase advisor 0011,
-- function_search_path_mutable). Without it a function resolves names using
-- whatever search_path its caller has. Same path the security-definer
-- functions already use, so behaviour doesn't change.

-- core: pure helpers exposed to the browser
alter function public.tier_for_elo(int)              set search_path = public, private, pg_temp;
alter function public.rank_name(int, int)            set search_path = public, private, pg_temp;
alter function public.normalize_answer(text)         set search_path = public, private, pg_temp;

-- core: private helpers called from the game functions
alter function private.require_uid()                 set search_path = public, private, pg_temp;
alter function private.pick_questions(uuid, int, uuid[]) set search_path = public, private, pg_temp;
alter function private.create_match(text, uuid, uuid)    set search_path = public, private, pg_temp;
alter function private.create_async_match(uuid)      set search_path = public, private, pg_temp;
alter function private.finish_match(uuid, uuid)      set search_path = public, private, pg_temp;
alter function private.finish_if_done(uuid)          set search_path = public, private, pg_temp;
alter function private.player_row(uuid, uuid)        set search_path = public, private, pg_temp;

-- early access
alter function private.client_ip()                   set search_path = public, private, pg_temp;
alter function private.normalize_access_code(text)   set search_path = public, private, pg_temp;
alter function private.hash_access_code(text)        set search_path = public, private, pg_temp;
