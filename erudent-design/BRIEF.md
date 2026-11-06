# Erudent — build brief for Claude Code

## What's in this folder

- `tokens.css` — every color, spacing and radius as CSS variables. Dark is the default theme (`:root`); light is `[data-theme="light"]`. Source of truth for values.
- `tokens.json` — the same tokens as data, plus the type scale.
- `DESIGN-SYSTEM.md` — the brand rules. Read before writing UI.
- `logos/` — final SVGs. `erudent-mark.svg` (64px+), `erudent-mark-small.svg` (favicon, small sizes), lockups and wordmarks in ink (light theme) and paper (dark theme).
- `landing-reference.html` — the approved early-access page as plain HTML. It's a **reference to rebuild**, not code to paste.

## Task 1 — early access landing page

Rebuild `landing-reference.html` in the app's real frontend stack as the site's root page.

1. Inspect the repo first: framework, routing, styling approach, existing backend routes for waitlist / access codes. Follow existing conventions.
2. Bring in `tokens.css` as the global token layer (or map it into the existing theme config). Use the variables; never hardcode hex values.
3. Copy `logos/` into the app's static assets. Favicon = `erudent-mark-small.svg`.
4. Font: **Archivo** (400, 600, 700, 800) via the framework's font loader. One family on this page.
5. Wire the two forms to the real backend:
   - Waitlist: email → store it; show the confirmation state.
   - Code: code → validate and redeem server-side; on success, route into the app; on failure, show an inline error under the field ("That code isn't valid or has been used.").
   If either endpoint doesn't exist yet, create it with validation and rate limiting, and say what you added.
6. Match the reference exactly: layout, sizes, copy, square corners, the 4px inset bottom edge on primary buttons, both themes, phone width.

## Non-negotiable design rules

- No rounded corners. No shadows except the button's inset bottom edge. No gradients, glass, glow or emoji.
- Monochrome: `paper`, `ink`, `ink-muted`, `hairline`, `rule`. The only color is `pencil` — errors, ∎, small emphasis. Never a fill, never a button.
- Primary button: `ink` background, `on-ink` text. One per screen.
- Text contrast is already checked in the tokens; don't introduce new colors.
- Accessible: real labels (visually hidden is fine), `role="alert"` on errors, `role="status"` on confirmations, visible focus ring (2px `focus`, 2px offset), 44px+ touch targets.

## Open decisions (ask Eliam, don't guess)

- The logo wordmark SVGs are set in Bodoni Moda; the site now uses Archivo. Keep the mark; use live Archivo text for "Erudent" until the wordmark is redrawn.
- Code format is assumed `XXXX-XXXX`; confirm against the access-code backend.
