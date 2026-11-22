# erudent

Ranked 1v1 math duels. Three questions, five minutes. Climb from Novice to Erudite.

**Practice** (`/practice`): solo, unrated, endless. One question at a time with the answer and
solution after each. Pick a tier, or let it adjust to you inside a range you choose. No timer, and your Elo never changes.

Built by **omertà**. Launching December 13, 2026.

## Run it on your computer

You need [Node.js](https://nodejs.org) (version 20 or newer) and [Git](https://git-scm.com).

```bash
# 1. Download the code
git clone https://github.com/omertabuilds/erudent.git
cd erudent

# 2. Install packages (takes a minute the first time)
npm install

# 3. Set up your env file
cp .env.example .env.local
# Then ask Eliam for the dev values and paste them into .env.local

# 4. Start the site
npm run dev
```

Open http://localhost:3000. The page reloads by itself when you save a file.

Static pages (About, Rules, How Elo works) work without `.env.local`. Anything that signs in or plays a match needs it.

## How we work

Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first change. The short version:

1. Pick your card on the Notion Build Board and move it to **Doing**.
2. Make a branch, do the work, open a pull request by Friday.
3. Move your card to **Check it**. Eliam reviews within 24 hours.
4. Once it's approved and merged, the card goes to **Done**.

Nobody pushes straight to `main`.

## Where things live

| Folder | What's in it |
| --- | --- |
| `src/app/` | Pages. Each folder is a URL: `src/app/about/page.tsx` → `/about` |
| `src/components/` | Pieces of UI used on more than one page |
| `src/lib/supabase/` | Code that talks to the database |
| `supabase/migrations/` | Database changes (Eliam only) |
| `.github/` | Pull request and bug report templates |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the site locally |
| `npm run lint` | Check your code for mistakes. Run before every PR |
| `npm run build` | Build the production site. If this fails, the PR can't merge |
| `npm test` | Play full matches and practice against a test database. Checks scoring, Elo, matchmaking, anti-cheat |

## Stack

Next.js (React, TypeScript), Tailwind, Supabase (auth, Postgres, realtime), Vercel.

## Team

| Name | Role |
| --- | --- |
| Eliam | Lead + backend |

## Local report-button testing

Requires Docker Desktop running with its Linux engine (WSL 2 on Windows).

```powershell
npm install
npm run local:start
npm run local:setup
npm run dev
```

Open http://127.0.0.1:3000/dev-login and choose **Start test duel**. This signs in as local Alice and joins local Bob to a friend duel. Bob does not submit answers. You can report questions during the duel or in its results.

The setup script creates two confirmed test accounts, grants local access, and adds 144 sample arithmetic questions across all tiers and both pools. It writes the local URL, public key, and a generated test-account password to ignored `.env.local`. It refuses to target a hosted Supabase instance. The test-login page is disabled outside development and requires a loopback Supabase URL.

Inspect saved reports in local Supabase Studio (URL printed by `npm run local:start`), under the `public.reports` table. No hosted project or Google OAuth configuration is required.
