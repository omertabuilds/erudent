# Contributing to erudent

This is the step-by-step for making a change. Follow it exactly the first few times.

## One-time setup

1. Make a GitHub account and send your username to Eliam.
2. Accept the invite to **omertabuilds** (check your email or github.com/notifications).
3. Install [VS Code](https://code.visualstudio.com), [Node.js](https://nodejs.org) 20+, and [Git](https://git-scm.com).
4. Follow **Run it on your computer** in the README.

## Every change, step by step

### 1. Start from the latest code

```bash
git checkout main
git pull
```

### 2. Make a branch for your card

Name it after what you're doing, lowercase with dashes:

```bash
git checkout -b about-page
```

### 3. Do the work

- Run `npm run dev` and check your change at http://localhost:3000.
- Check it at phone width too (in Chrome: right-click → Inspect → the phone icon).
- Keep the change to your card only. Don't fix other things in the same branch.

### 4. Save your work (commit)

```bash
git add .
git commit -m "Add About page with team credits"
```

Write the message as what the change does, starting with a verb: *Add*, *Fix*, *Update*.

### 5. Check it before you send it

```bash
npm run lint
npm run build
```

Both must pass. If they fail, read the error, fix it, and commit again.

### 6. Send it (push) and open a pull request

```bash
git push -u origin about-page
```

GitHub prints a link. Open it, fill in the template, and click **Create pull request**.

### 7. Move your Notion card to "Check it"

Eliam reviews within 24 hours. If he asks for changes, make them on the same branch, then commit and push again. The pull request updates by itself.

### 8. Merged = done

After approval, Eliam merges it. Move your card to **Done**, then:

```bash
git checkout main
git pull
```

## Rules

- **Never push to `main`.** It's blocked anyway.
- **Never commit keys or passwords.** `.env.local` stays on your computer. If you think you leaked one, tell Eliam right away.
- **Using AI is fine. Not understanding the code isn't.** You should be able to explain every line in your pull request.
- **Stuck for 24 hours?** Post in #project-erudent and tag who you need.

## Styling

- Black and white only. Use `text-foreground`, `bg-background`, `text-muted` and `border-line`, not raw colors.
- Every page must work at phone width.
- Use real `<button>` and `<a>` tags for things people click.
