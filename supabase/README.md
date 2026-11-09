# supabase/

Database changes live here as SQL migration files, one per change, named with a timestamp:

```
supabase/migrations/20261111000000_initial_schema.sql
```

Only Eliam writes migrations for now. The rules that matter:

- **Answers never reach the browser.** Question answers and solutions are only readable by server code.
- **Scoring and timing run on the server.** The browser only sends answers and shows results.
- **Every table has row level security turned on.**

## How the game database works

The browser can read **profiles** and nothing else. Everything else goes through
functions (RPCs) in `migrations/20261105000000_core.sql`. Wrappers for each live in
`src/lib/erudent.ts`.

| Function | Who | What it does |
| --- | --- | --- |
| `create_profile(username, birth_date)` | signed in | Makes your profile. Blocks under 13. Birth date is checked, not saved. |
| `join_queue()` | signed in | Call every ~2s. Returns a match id once matched, else null. ±200 Elo, ±400 after 15s, recorded run after 30s. |
| `leave_queue()` | signed in | Stop searching. |
| `create_friend_match()` / `join_friend_match(code)` | signed in | 6-letter codes, unranked. Invite link: `/join/CODE`. |
| `get_match(id)` | players | Everything the match screen needs. Prompts after start, answers after finish. |
| `submit_answer(id, slot, answer)` | players | One try per question. Integers or fractions only. |
| `focus_event(id, slot)` | players | Tab switch. 1st = warning, 2nd = lose that question + flag. Ranked only. |
| `heartbeat(id)` / `claim_forfeit(id)` | players | Every 5s. Silent for 30s = forfeit. |
| `finish_match(id)` | players | Closes the match when time's up. Safe to call twice. |
| `my_active_match()` | signed in | Resume a match after closing the tab. |
| `report_question` / `report_player` | players | Saved to `reports` for review. |
| `get_leaderboard(limit)` | anyone | Players with 10+ matches, by Elo. |
| `get_profile(username)` | anyone | One profile, any case. For `/u/[username]`. |
| `get_recent_matches(username)` | anyone | Last 10 finished duels, any case. For profile pages. |
| `check_username(username)` | signed in | Null if allowed and free, else the reason (`username_taken`, `username_blocked`…). |
| `rename_username(username)` | signed in | Only for flagged names. Elo and history stay. |
| `my_player()` | signed in | Your own profile plus your private `needs_rename`. |
| `has_access()` | signed in | True once you've redeemed an invitation code. Without one, queueing, creating or joining a match and answering raise `no_access`. |
| `next_practice_question(tier)` | signed in | Practice. Tier 1–6 stays there; null = auto (starts at your Elo's tier). Same question until it's answered or skipped. Never the answer. |
| `submit_practice_answer(answer)` | signed in | Marks it and reveals answer + solution. Wrong format doesn't use the question up. |
| `skip_practice_question()` | signed in | Counts as wrong, reveals answer + solution. |
| `practice_stats()` | signed in | Attempted, correct, streak, best streak, per tier, and your saved tier setting. |
| `report_practice_question(question, reason)` | signed in | Only for questions you've attempted in practice. Saved to `reports` with no match. |

**Usernames:** 3–20 of a–z A–Z 0–9 _ . -, starting with a letter or digit, never two
symbols in a row. Shown as typed, unique ignoring case. Reserved names and the wordlist
(`wordlists/`, checked after undoing leetspeak) are blocked; brand and staff names (erudent,
admin, mod…) anywhere in a name. A trigger enforces this on every write. Names that broke the
rules when they arrived are flagged in `private.username_flags`, which only the player can see
(via `my_player()`), and can't play until renamed.

**Rules:** questions A/B/C come from one tier below, at, and above the players'
average Elo, worth 1/2/3 points. Ties go to the faster total time on correct answers.
Elo starts at 900, K = 80 for the first 10 matches, then 20. Rank shows after 10 matches.

**Practice:** solo and unrated, never touches Elo. Needs an invitation code and a valid
username, and is off while you're in a live duel. Auto tier: 2 right in a row moves up a tier,
a miss or skip moves down. Questions you've never seen come first, then the ones you practiced
longest ago. Every answer revealed in practice goes into `seen_questions`, so ranked steers
away from it. `practice_state` and `practice_attempts` are unreadable from the browser.

## Applying migrations

```bash
npx supabase link --project-ref kkzufqcajtgcyahrniyy
npx supabase db push
```

Or paste the file into Supabase → SQL Editor → Run.

## Tests

`npm test` runs the whole game against an in-memory Postgres (PGlite). No Supabase
account needed. Add a test in `tests/db/` for any rule you change.

## Question pools

Every question is in one pool. **ranked** questions are used by duels and recorded-run
replays, and their answers are only shown after a match. **practice** questions are used
by practice mode, which shows the answer right after each attempt. The two never mix, so
practice can't leak ranked answers. New rows default to ranked. Practice questions live in
the Notion **Practice Bank** (written for practice, or retired from ranked).

## Loading questions

`npm run import-questions` copies every **Approved** question from the Notion Question
Bank into the database and marks it **Live**. Bad answers get marked **Needs fix**.
Add `-- --dry` to preview. Needs the server-only keys in `.env.local` (see `.env.example`).
