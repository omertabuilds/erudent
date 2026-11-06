# Username wordlists

Seeded into the database by `migrations/20261106025646_username_rules.sql`.
`tests/db/usernames.test.ts` fails if a list here and the migration's copy drift apart.
To change a list: edit the file, paste the same lines into a new migration, run `npm test`.

## en.txt: blocked words

The English list from **List of Dirty, Naughty, Obscene, and Otherwise Bad Words**
by Shutterstock and contributors, https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words,
commit `5faf2ba42d7b1c0977169ec3611df25a3c08eb13`, unmodified.
Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## allow.txt: ours

Ordinary words that contain a blocked word or a reserved name (gr**ape**, **anal**ysis,
pea**cock**, **mod**el, b**admin**ton).
They're masked out of each part of a name (split at _ . - and at a lower→UPPER change)
before the substring check, so "Analysis_Fan" is fine and "analysis_fu.ck" still isn't.
An allowed word can't span parts: "mod_eliam" is not "modeliam". Stems are fine: `therap` covers therapy and therapist.

## How a name is checked

1. Lowercase, then leetspeak: 0→o 1→i 3→e 4→a 5→s @→a. Drop everything but a–z and 0–9.
   Blocked words get the same treatment, so "2 girls 1 cup" becomes `2girlsicup`.
2. Blocked words shorter than 4 letters (ass, cum, sex…) only match the whole name.
   Longer ones match anywhere, after the allow list is masked out.
3. Reserved names erudent, omerta, admin, mod, staff, support and official match anywhere,
   after the allow list is masked out. `moderator` matches anywhere without masking (`mode`
   is allowed and would hide it). system, null and undefined only match the whole name.
