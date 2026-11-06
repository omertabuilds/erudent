-- =====================================================================
-- Username rules
--
--   3–20 characters: ASCII letters, digits, and _ . -
--   Starts with a letter or digit. No two symbols in a row.
--   Unique ignoring case: Eliam and eliam are the same name. Shown as typed.
--   No reserved names: erudent, omerta, admin, mod, staff, support, official and
--   moderator anywhere in the name; system, null, undefined as the whole name.
--   Nothing from the blocked wordlist. Both checked after leetspeak
--   (0→o 1→i 3→e 4→a 5→s @→a) and dropping _ . -
--
-- Enforced by a trigger on every insert and username change, whoever makes it.
-- Names that already break a rule aren't rejected: they're flagged in
-- private.username_flags, and the player can't queue or start a match until they pick
-- a new one (rename_username). Only the player sees their own flag (my_player).
--
--   my_player()            signed in   Your profile, plus needs_rename. Empty if you have none.
--   check_username(name)   signed in   Null if the name is free and allowed, else the reason.
--   rename_username(name)  signed in   Only when your name is flagged.
--   get_profile(name)      anyone      One profile by name, any case. For /u/[username].
--
-- Wordlists: supabase/wordlists/ (README there has the source and license).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Wordlists
-- ---------------------------------------------------------------------

-- What names and words are compared as: "M4th.Wiz_0" → "mathwizo".
-- Lowercase, leetspeak (0→o 1→i 3→e 4→a 5→s @→a), keep only a–z and 0–9.
create or replace function private.username_key(p text)
returns text language sql immutable set search_path = public, private, pg_temp as $$
  select regexp_replace(translate(lower(coalesce(p, '')), '01345@', 'oieasa'), '[^a-z0-9]', '', 'g')
$$;

-- en.txt, one row per line as published. `word` is what names are matched against.
create table private.blocked_words (
  entry text primary key,
  word  text not null generated always as (private.username_key(entry)) stored
);

-- allow.txt: ordinary words that contain a blocked word or reserved name (grape, model). Masked out first.
create table private.allowed_words (
  word text primary key check (word = private.username_key(word) and word <> '')
);

alter table private.blocked_words enable row level security;
alter table private.allowed_words enable row level security;

insert into private.blocked_words (entry)
select distinct line from unnest(string_to_array($list$
2g1c
2 girls 1 cup
acrotomophilia
alabama hot pocket
alaskan pipeline
anal
anilingus
anus
apeshit
arsehole
ass
asshole
assmunch
auto erotic
autoerotic
babeland
baby batter
baby juice
ball gag
ball gravy
ball kicking
ball licking
ball sack
ball sucking
bangbros
bangbus
bareback
barely legal
barenaked
bastard
bastardo
bastinado
bbw
bdsm
beaner
beaners
beaver cleaver
beaver lips
beastiality
bestiality
big black
big breasts
big knockers
big tits
bimbos
birdlock
bitch
bitches
black cock
blonde action
blonde on blonde action
blowjob
blow job
blow your load
blue waffle
blumpkin
bollocks
bondage
boner
boob
boobs
booty call
brown showers
brunette action
bukkake
bulldyke
bullet vibe
bullshit
bung hole
bunghole
busty
butt
buttcheeks
butthole
camel toe
camgirl
camslut
camwhore
carpet muncher
carpetmuncher
chocolate rosebuds
cialis
circlejerk
cleveland steamer
clit
clitoris
clover clamps
clusterfuck
cock
cocks
coprolagnia
coprophilia
cornhole
coon
coons
creampie
cum
cumming
cumshot
cumshots
cunnilingus
cunt
darkie
date rape
daterape
deep throat
deepthroat
dendrophilia
dick
dildo
dingleberry
dingleberries
dirty pillows
dirty sanchez
doggie style
doggiestyle
doggy style
doggystyle
dog style
dolcett
domination
dominatrix
dommes
donkey punch
double dong
double penetration
dp action
dry hump
dvda
eat my ass
ecchi
ejaculation
erotic
erotism
escort
eunuch
fag
faggot
fecal
felch
fellatio
feltch
female squirting
femdom
figging
fingerbang
fingering
fisting
foot fetish
footjob
frotting
fuck
fuck buttons
fuckin
fucking
fucktards
fudge packer
fudgepacker
futanari
gangbang
gang bang
gay sex
genitals
giant cock
girl on
girl on top
girls gone wild
goatcx
goatse
god damn
gokkun
golden shower
goodpoop
goo girl
goregasm
grope
group sex
g-spot
guro
hand job
handjob
hard core
hardcore
hentai
homoerotic
honkey
hooker
horny
hot carl
hot chick
how to kill
how to murder
huge fat
humping
incest
intercourse
jack off
jail bait
jailbait
jelly donut
jerk off
jigaboo
jiggaboo
jiggerboo
jizz
juggs
kike
kinbaku
kinkster
kinky
knobbing
leather restraint
leather straight jacket
lemon party
livesex
lolita
lovemaking
make me come
male squirting
masturbate
masturbating
masturbation
menage a trois
milf
missionary position
mong
motherfucker
mound of venus
mr hands
muff diver
muffdiving
nambla
nawashi
negro
neonazi
nigga
nigger
nig nog
nimphomania
nipple
nipples
nsfw
nsfw images
nude
nudity
nutten
nympho
nymphomania
octopussy
omorashi
one cup two girls
one guy one jar
orgasm
orgy
paedophile
paki
panties
panty
pedobear
pedophile
pegging
penis
phone sex
piece of shit
pikey
pissing
piss pig
pisspig
playboy
pleasure chest
pole smoker
ponyplay
poof
poon
poontang
punany
poop chute
poopchute
porn
porno
pornography
prince albert piercing
pthc
pubes
pussy
queaf
queef
quim
raghead
raging boner
rape
raping
rapist
rectum
reverse cowgirl
rimjob
rimming
rosy palm
rosy palm and her 5 sisters
rusty trombone
sadism
santorum
scat
schlong
scissoring
semen
sex
sexcam
sexo
sexy
sexual
sexually
sexuality
shaved beaver
shaved pussy
shemale
shibari
shit
shitblimp
shitty
shota
shrimping
skeet
slanteye
slut
s&m
smut
snatch
snowballing
sodomize
sodomy
spastic
spic
splooge
splooge moose
spooge
spread legs
spunk
strap on
strapon
strappado
strip club
style doggy
suck
sucks
suicide girls
sultry women
swastika
swinger
tainted love
taste my
tea bagging
threesome
throating
thumbzilla
tied up
tight white
tit
tits
titties
titty
tongue in a
topless
tosser
towelhead
tranny
tribadism
tub girl
tubgirl
tushy
twat
twink
twinkie
two girls one cup
undressing
upskirt
urethra play
urophilia
vagina
venus mound
viagra
vibrator
violet wand
vorarephilia
voyeur
voyeurweb
voyuer
vulva
wank
wetback
wet dream
white power
whore
worldsex
wrapping men
wrinkled starfish
xx
xxx
yaoi
yellow showers
yiffy
zoophilia
🖕
$list$, E'\n')) line where line <> '';

insert into private.allowed_words (word)
select distinct line from unnest(string_to_array($list$
analog
analys
analyt
analyz
banal
canal
among
lemong
monger
mongol
mongoos
babcock
cockatiel
cockatoo
cockcroft
cocker
cockpit
cockroach
cocktail
hancock
hitchcock
peacock
shuttlecock
woodcock
drape
grape
parapet
rapeseed
scrape
scraping
therap
trapez
aspic
auspic
conspic
despic
perspic
spice
abut
butte
button
rebut
confiscat
coruscat
muscat
scatter
sement
bismuth
heraclit
janus
coriolanus
uranus
honeysuckle
harpoon
lampoon
spoon
artificial
commercial
crucial
facial
financial
glacial
judicial
racial
social
special
montenegro
negroni
barracoon
cocoon
raccoon
racoon
tycoon
swank
dickens
dickinson
dickson
twater
twinkle
thorny
brimming
trimming
spoof
scunthorpe
badminton
mode
modi
modu
modal
commod
accommod
spasmod
flagstaff
distaff
stafford
$list$, E'\n')) line where line <> '';


-- ---------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------

-- Why a name isn't allowed, or null if it is. Doesn't check whether it's taken.
create or replace function private.username_problem(p text)
returns text language plpgsql stable set search_path = public, private, pg_temp as $$
declare
  k text;
  masked text;
  part text;
  a record;
begin
  if p is null or length(p) not between 3 and 20 then return 'username_length'; end if;
  if p !~ '^[A-Za-z0-9_.-]+$' then return 'username_chars'; end if;  -- ranges are by code point: ASCII only
  if p !~ '^[A-Za-z0-9]' then return 'username_start'; end if;
  if p ~ '[_.-]{2}' then return 'username_symbols'; end if;

  -- Allowed words (model, badminton, grape…) are masked out before substring checks, one part
  -- of the name at a time: parts split at _ . - and at a lower→UPPER change. Otherwise
  -- "mod_eliam" would read as "modeliam" and the allowed "mode" would hide "mod".
  -- '|' keeps the pieces around a mask from joining up.
  k := private.username_key(p);
  masked := '';
  for part in select unnest(regexp_split_to_array(regexp_replace(p, '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[_.-]')) loop
    part := private.username_key(part);
    for a in select word from private.allowed_words order by length(word) desc, word loop
      part := replace(part, a.word, '|');
    end loop;
    masked := masked || part;
  end loop;

  -- Brand and staff names anywhere. "moderator" is checked unmasked: "mode" is allowed and would hide it.
  if k in ('system', 'null', 'undefined')
     or k like '%moderator%'
     or masked ~ '(erudent|omerta|admin|mod|staff|support|official)' then
    return 'username_reserved';
  end if;

  -- Short blocked words (ass, cum…) only match the whole name; longer ones match anywhere.
  if exists (
    select 1 from private.blocked_words b
     where b.word <> ''
       and (b.word = k or (length(b.word) >= 4 and position(b.word in masked) > 0))
  ) then
    return 'username_blocked';
  end if;
  return null;
end
$$;

create or replace function private.username_taken(p text, p_except uuid default null)
returns boolean language sql stable set search_path = public, private, pg_temp as $$
  select exists (select 1 from public.profiles
                  where lower(username) = lower(p) and id is distinct from p_except)
$$;

-- Who has to pick a new name. Private: other players never learn who was flagged.
create table private.username_flags (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  flagged_at timestamptz not null default now()
);
alter table private.username_flags enable row level security;

-- Every insert and every username change goes through the rules. A new name clears the flag.
create or replace function private.profiles_username_guard()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare problem text := private.username_problem(new.username);
begin
  if problem is not null then raise exception '%', problem; end if;
  if tg_op = 'UPDATE' then delete from private.username_flags where user_id = new.id; end if;
  return new;
end
$$;

-- Flagged players can't queue or join a match. Recorded runs (ghosts) still replay.
create or replace function private.require_valid_username()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if exists (select 1 from private.username_flags where user_id = new.user_id) then
    raise exception 'needs_rename';
  end if;
  return new;
end
$$;


-- ---------------------------------------------------------------------
-- Profiles: flag existing names, case-insensitive uniqueness
-- ---------------------------------------------------------------------

insert into private.username_flags (user_id)
select id from public.profiles where private.username_problem(username) is not null;
delete from public.queue q using private.username_flags f where f.user_id = q.user_id;

alter table public.profiles drop constraint profiles_username_check;
alter table public.profiles drop constraint profiles_username_key;
-- Named so a race on create_profile still reads as username_taken in the app.
create unique index profiles_username_taken on public.profiles (lower(username));

create trigger profiles_username_guard
  before insert or update of username on public.profiles
  for each row execute function private.profiles_username_guard();

create trigger queue_require_valid_username
  before insert or update on public.queue
  for each row execute function private.require_valid_username();

create trigger match_players_require_valid_username
  before insert on public.match_players
  for each row when (not new.is_ghost) execute function private.require_valid_username();


-- ---------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------

-- Same as core, except: names keep their case, and the new rules apply.
create or replace function public.create_profile(p_username text, p_birth_date date)
returns public.profiles language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  u text := trim(p_username);
  problem text := private.username_problem(u);
  r public.profiles;
begin
  if exists (select 1 from profiles where id = uid) then raise exception 'profile_exists'; end if;
  if p_birth_date is null or p_birth_date > current_date then raise exception 'invalid_birth_date'; end if;
  if extract(year from age(current_date, p_birth_date)) < 13 then raise exception 'too_young'; end if;
  if problem is not null then raise exception '%', problem; end if;
  if private.username_taken(u) then raise exception 'username_taken'; end if;
  insert into profiles (id, username) values (uid, u) returning * into r;
  return r;
end
$$;

-- For the username field as you type. Null = good to go. Rate limited per account.
create or replace function public.check_username(p_username text)
returns text language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  u text := trim(p_username);
  problem text := private.username_problem(u);
begin
  -- Returns rather than raises, so the hit isn't rolled back with the error.
  begin
    perform private.rate_limit('check_username', uid::text, 120, interval '10 minutes');
  exception when others then
    if sqlerrm = 'rate_limited' then return 'rate_limited'; end if;
    raise;
  end;
  if problem is not null then return problem; end if;
  if private.username_taken(u, uid) then return 'username_taken'; end if;
  return null;
end
$$;

-- Only for players whose name was flagged. Elo and history stay: they hang off the id.
create or replace function public.rename_username(p_username text)
returns public.profiles language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  uid uuid := private.require_uid();
  u text := trim(p_username);
  problem text := private.username_problem(u);
  r public.profiles;
begin
  select * into r from profiles where id = uid for update;
  if not found then raise exception 'no_profile'; end if;
  if not exists (select 1 from private.username_flags where user_id = uid) then
    raise exception 'rename_not_needed';
  end if;
  if problem is not null then raise exception '%', problem; end if;
  if private.username_taken(u, uid) then raise exception 'username_taken'; end if;
  update profiles set username = u where id = uid returning * into r;
  return r;
end
$$;

-- The signed-in player's own profile, with their private needs_rename. Empty without a profile.
create or replace function public.my_player()
returns table (id uuid, username text, elo int, matches_played int, wins int, losses int, draws int, needs_rename boolean)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select p.id, p.username, p.elo, p.matches_played, p.wins, p.losses, p.draws,
         exists (select 1 from private.username_flags f where f.user_id = p.id)
    from public.profiles p
   where p.id = auth.uid();
$$;

create or replace function public.get_profile(p_username text)
returns table (username text, elo int, rank text, matches_played int, wins int, losses int, draws int, created_at timestamptz)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select p.username, p.elo, public.rank_name(p.elo, p.matches_played), p.matches_played,
         p.wins, p.losses, p.draws, p.created_at
    from public.profiles p
   where lower(p.username) = lower(trim(p_username));
$$;

-- Same as core, except the name matches in any case.
create or replace function public.get_recent_matches(p_username text)
returns table (match_id uuid, mode text, finished_at timestamptz, result text,
               elo_before int, elo_after int, opponent text, score int, opponent_score int)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select m.id, m.mode, m.finished_at, me.result, me.elo_before, me.elo_after,
         op.username, me.score, them.score
    from public.profiles p
    join public.match_players me on me.user_id = p.id and not me.is_ghost
    join public.matches m on m.id = me.match_id and m.status = 'finished'
    left join public.match_players them on them.match_id = m.id and them.user_id <> p.id
    left join public.profiles op on op.id = them.user_id
   where lower(p.username) = lower(trim(p_username))
   order by m.finished_at desc
   limit 10;
$$;


-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------

revoke all on private.blocked_words, private.allowed_words, private.username_flags from public, anon, authenticated;
grant all on private.blocked_words, private.allowed_words, private.username_flags to service_role;

revoke all on function
  private.username_key(text),
  private.username_problem(text),
  private.username_taken(text, uuid),
  private.profiles_username_guard(),
  private.require_valid_username(),
  public.check_username(text),
  public.rename_username(text),
  public.my_player(),
  public.get_profile(text)
from public, anon, authenticated;

grant execute on function public.my_player(), public.check_username(text), public.rename_username(text) to authenticated;
grant execute on function public.get_profile(text) to anon, authenticated;
grant execute on all functions in schema public to service_role;
grant all on all functions in schema private to service_role;
