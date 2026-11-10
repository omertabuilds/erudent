-- =====================================================================
-- Profile style: banner, accent, tagline, profile picture
--
--   banner      'grid' | 'mountain' | 'construction' | 'solid'   Banner art preset.
--   accent      0–6. 0 = the player's rank hue; 1–6 = one of the six rank hues.
--   tagline     Up to 60 characters, or null. Same blocked wordlist as usernames.
--   avatar_path Storage path in the "avatars" bucket ('<uid>/…'), or null for the initial.
--
--   update_profile_style(banner, accent, tagline)   signed in   Your own row only.
--   set_avatar(path)                                signed in   Point at a file you uploaded, or null to remove.
--   my_player()                                     signed in   Now also returns the four fields above.
--
-- Storage: bucket "avatars", public read (the app builds public URLs from avatar_path).
-- Signed-in players can write, replace and delete only under their own '<uid>/' folder.
-- 2 MB per file; JPEG, PNG or WebP. The browser crops to 256×256 WebP before uploading.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------

alter table public.profiles
  add column banner      text not null default 'grid' check (banner in ('grid', 'mountain', 'construction', 'solid')),
  add column accent      int  not null default 0 check (accent between 0 and 6),
  add column tagline     text check (char_length(tagline) <= 60),
  add column avatar_path text;


-- ---------------------------------------------------------------------
-- Tagline rules
-- ---------------------------------------------------------------------

-- True if a tagline uses a blocked word. The username check, one word at a time:
-- each word is normalized like a name (leetspeak, symbols dropped), allowed words are
-- masked out, then short blocked words must match the whole word and longer ones match anywhere.
-- Reserved names (erudent, admin…) aren't checked: "Erudent since day one" is a fine tagline.
create or replace function private.tagline_blocked(p text)
returns boolean language plpgsql stable set search_path = public, private, pg_temp as $$
declare
  w text;
  k text;
  masked text;
  part text;
  a record;
  words text;
begin
  if p is null then return false; end if;
  for w in select unnest(regexp_split_to_array(p, '\s+')) loop
    k := private.username_key(w);
    continue when k = '';
    -- Same masking as username_problem: parts split at _ . - and at a lower→UPPER change.
    masked := '';
    for part in select unnest(regexp_split_to_array(regexp_replace(w, '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[_.-]')) loop
      part := private.username_key(part);
      for a in select word from private.allowed_words order by length(word) desc, word loop
        part := replace(part, a.word, '|');
      end loop;
      masked := masked || part;
    end loop;
    if exists (
      select 1 from private.blocked_words b
       where b.word <> ''
         and (b.word = k or (length(b.word) >= 4 and position(b.word in masked) > 0))
    ) then
      return true;
    end if;
  end loop;

  -- Multi-word entries ("ball gag") match as whole words in a row, so "football gaga" is fine.
  words := ' ' || coalesce((select string_agg(private.username_key(x), ' ')
                              from unnest(regexp_split_to_array(p, '\s+')) x
                             where private.username_key(x) <> ''), '') || ' ';
  return exists (
    select 1 from private.blocked_words b
     where b.entry ~ '\s'
       and position(' ' || (select string_agg(private.username_key(y), ' ')
                              from unnest(regexp_split_to_array(b.entry, '\s+')) y
                             where private.username_key(y) <> '') || ' ' in words) > 0
  );
end
$$;


-- ---------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------

-- Banner, accent and tagline together, as the Customize panel saves them.
-- The tagline is trimmed with runs of whitespace (and control characters) folded to one space; empty → null.
create or replace function public.update_profile_style(p_banner text, p_accent int, p_tagline text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  t text := nullif(btrim(regexp_replace(coalesce(p_tagline, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), '');
  r public.profiles;
begin
  if not exists (select 1 from profiles where id = uid) then raise exception 'no_profile'; end if;
  if p_banner is null or p_banner not in ('grid', 'mountain', 'construction', 'solid') then raise exception 'invalid_banner'; end if;
  if p_accent is null or p_accent not between 0 and 6 then raise exception 'invalid_accent'; end if;
  if char_length(t) > 60 then raise exception 'tagline_length'; end if;
  if private.tagline_blocked(t) then raise exception 'tagline_not_allowed'; end if;

  update profiles set banner = p_banner, accent = p_accent, tagline = t where id = uid returning * into r;
  return jsonb_build_object('banner', r.banner, 'accent', r.accent, 'tagline', r.tagline);
end
$$;

-- Point your profile at a picture you've uploaded to avatars/<your id>/…, or null to remove it.
-- The file has to exist: the app uploads first, then calls this.
create or replace function public.set_avatar(p_path text)
returns text language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid uuid := private.require_uid();
begin
  if not exists (select 1 from profiles where id = uid) then raise exception 'no_profile'; end if;
  if p_path is not null then
    -- One file directly inside your own folder. No subfolders, no "..".
    if p_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$') then raise exception 'avatar_path_invalid'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path) then
      raise exception 'avatar_missing';
    end if;
  end if;
  update profiles set avatar_path = p_path where id = uid;
  return p_path;
end
$$;

-- Same as username_rules, plus the style fields. The returned columns change, so drop and recreate.
drop function public.my_player();
create function public.my_player()
returns table (id uuid, username text, elo int, matches_played int, wins int, losses int, draws int, needs_rename boolean,
               banner text, accent int, tagline text, avatar_path text)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select p.id, p.username, p.elo, p.matches_played, p.wins, p.losses, p.draws,
         exists (select 1 from private.username_flags f where f.user_id = p.id),
         p.banner, p.accent, p.tagline, p.avatar_path
    from public.profiles p
   where p.id = auth.uid();
$$;


-- ---------------------------------------------------------------------
-- Storage: avatars bucket
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read goes through the bucket's public URLs, which don't need a policy.
-- Select is limited to your own folder: storage needs it to replace and delete your files.
create policy "avatars: read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: replace in own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: delete from own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------

revoke all on function
  private.tagline_blocked(text),
  public.update_profile_style(text, int, text),
  public.set_avatar(text),
  public.my_player()
from public, anon, authenticated;

grant execute on function public.update_profile_style(text, int, text), public.set_avatar(text), public.my_player() to authenticated;
grant execute on all functions in schema public to service_role;
grant all on all functions in schema private to service_role;
