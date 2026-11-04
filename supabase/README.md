# supabase/

Database changes live here as SQL migration files, one per change, named with a timestamp:

```
supabase/migrations/20261111000000_initial_schema.sql
```

Only Eliam writes migrations for now. The rules that matter:

- **Answers never reach the browser.** Question answers and solutions are only readable by server code.
- **Scoring and timing run on the server.** The browser only sends answers and shows results.
- **Every table has row level security turned on.**
