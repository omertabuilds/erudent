-- =====================================================================
-- Public launch: anyone signed in can play. No invitation code needed.
--
-- Every access check (queue, friend matches, submissions, practice) goes through
-- private.user_has_access, so this switch is the only change the gate needs.
--
--   private.settings('open_access')   true  → every signed-in account has access
--                                     false → back to invite-only (redeemed code required)
--
-- Flip it from the SQL editor, no deploy needed:
--   update private.settings set enabled = false where key = 'open_access';  -- close the doors
--   update private.settings set enabled = true  where key = 'open_access';  -- reopen
--
-- Codes keep working either way: redeemed codes stay tied to their accounts, so
-- early players keep access if the doors are ever closed again.
-- =====================================================================

create table private.settings (
  key     text primary key,
  enabled boolean not null
);
alter table private.settings enable row level security;

insert into private.settings (key, enabled) values ('open_access', true);

create or replace function private.user_has_access(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select p_uid is not null and (
    coalesce((select enabled from private.settings where key = 'open_access'), false)
    or exists (select 1 from public.access_codes where redeemed_by = p_uid)
  );
$$;

revoke all on private.settings from public, anon, authenticated;
grant all on private.settings to service_role;
