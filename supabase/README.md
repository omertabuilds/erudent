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
| `get_recent_matches(username)` | anyone | For profile pages. |

**Rules:** questions A/B/C come from one tier below, at, and above the players'
average Elo, worth 1/2/3 points. Ties go to the faster total time on correct answers.
Elo starts at 900, K = 80 for the first 10 matches, then 20. Rank shows after 10 matches.

## Applying migrations

```bash
npx supabase link --project-ref kkzufqcajtgcyahrniyy
npx supabase db push
```

Or paste the file into Supabase → SQL Editor → Run.

## Tests

`npm test` runs the whole game against an in-memory Postgres (PGlite). No Supabase
account needed. Add a test in `tests/db/` for any rule you change.

## Loading questions

`npm run import-questions` copies every **Approved** question from the Notion Question
Bank into the database and marks it **Live**. Bad answers get marked **Needs fix**.
Add `-- --dry` to preview. Needs the server-only keys in `.env.local` (see `.env.example`).
