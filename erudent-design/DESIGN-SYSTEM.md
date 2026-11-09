Erudent is a competitive problem-solving arena — 1v1 duels, Elo, ranked tiers. The identity is **The Proof**: it takes its prestige from mathematics itself, not from universities. Ink, paper and one red pencil. It should read like a journal of record that happens to keep score.

## Principles

- **Borrow nothing.** No school colors, crests, seals, Latin, roman-numeral dates or "EST." lines. Every motif comes from mathematics: ∃, ∎, theorems, numbered statements, construction lines.
- **Monochrome first.** A screen is `paper` and `ink`. `pencil` is the one color, used the way a grader uses a red pencil: small, rare, meaningful.
- **Printed, not rendered.** No gradients, glass, glow or blur on UI. Separate with `hairline` rules and space.
- **Soft corners, one shape language.** Buttons, inputs and cards use `r-md` (16px). Chips and tags use `r-pill`. `r-sm` (10px) only for a control nested inside an `r-md` frame. Avatars stay `radius-full`. Rules, tables and full-bleed sheets stay square.
- **Depth is for floating things only.** `shadow-float` is the single shadow token: neutral, low opacity, never colored. It belongs to elements that float over the hero. Everything else sits flat on the page.
- **Quiet confidence.** Large Archivo 800, generous space (`space-32` between sections), short sentences. Say less.

## Not vibecoded

Never ship: soft shadows on anything that isn't floating; a 3-up grid of icon + title + blurb; pill badges with a colored dot; gradient or glowing text; emoji; a "New" chip above the hero; Inter, Geist or system-ui as the main face; Lucide icons as decoration; centered-everything layouts (a centered hero is fine; the rest of the page aligns to the grid); numbers in a mono font; filler stats; "unlock", "supercharge", "level up".

Do: left-aligned asymmetric grids; numbered statements (Theorem 1, 2, 3) instead of feature cards; tabular figures for anything that counts; one ∎ to close a section.

## Voice

- Precise, spare, dry. Write like a theorem: claim, then proof. "There exists a faster solver than you. Find out who."
- Sentence case, uppercase only for kickers. No exclamation marks, no emoji.
- Results are stated, not celebrated: "Victory, by two problems to one." "+18 ∎". "Defeat · −12".
- ∎ ends a result, a section or a proof. Never use it as a bullet.

## Color

- Dark is the default; Light is paper. Set `data-theme` on `<html>`.
- `paper` page; `surface` sheets and panels, edged with `hairline`; `sunken` answer fields.
- `ink` text; `ink-muted` secondary text and losses.
- Primary button: `ink` fill, `on-ink` text, `r-md`. One per screen. Secondary button: transparent, 1px `rule` border, `ink` text, `r-md`.
- Chips: `r-pill`, 1px `rule` or `hairline` border, `ink` or `ink-muted` text. No colored dot, no fill.
- `pencil` for: Elo gains, ✓, the ∎, the timer under 0:30, at most one emphasized word in a headline. Never a large fill, never a button.
- Wins and losses: gains in `pencil` with "+N" or ✓; losses in `ink-muted` with "−N" or ✗. Never color alone.
- Focus: 2px solid `focus`, 2px offset.

## Type

- One family: **Archivo**, weights 400, 600, 700 and 800, loaded with `next/font` in `layout.tsx` and used as `font-ui`. No serif, no mono, no second face.
- Weights: 800 for headlines, display numbers and the wordmark; 700 for buttons; 600 for labels, tabs, chips and emphasis; 400 for reading text.
- Scale:
  - Hero: `clamp(52px, 8vw, 104px)`, 800, line-height 0.95, tracking −0.04em.
  - Section title: `clamp(36px, 5vw, 56px)`, 800, line-height 1, tracking −0.03em.
  - Card title: 28px, 800, tracking −0.02em.
  - Lede: 19/29, 400, `ink-muted`, at most 640px wide.
  - Body: 17/26, 400.
  - Label: 15px, 600 — buttons, tabs, form labels. Caption: 13px, 400, `ink-muted` — notes and fine print.
- Negative tracking only at display sizes; text at 19px and below is set as drawn.
- Kickers: 13px, 600, uppercase, tracking 0.08em. Archivo has no true small caps, so don't fake them with `font-variant`.
- Statements: "Theorem 1." in 600, the claim in 400 on the same line.
- Figures: `tabular-nums` for anything that counts — clocks, Elo, scores, points, codes.
- Math in KaTeX's default fonts (Computer Modern), unstyled — it already belongs here.
- The logo mark and the wordmark and lockup SVGs are still drawn in Bodoni Moda until they're redrawn. Until then, set "Erudent" in live Archivo 800 beside the mark.

## Space and layout

- 4px base: `space-1` … `space-32`. Sheet padding `space-6`; gutter `space-4` mobile, `space-16` desktop; sections `space-32` apart on desktop.
- 12-column grid, 1200px max, left-aligned. Text sits in columns 1–7; columns 9–12 carry margin notes, figures or the result sheet.
- Header: lockup left, two text links and the primary button right, a `hairline` rule beneath.

## Logo

- The mark is **∃∎**: a mirrored Bodoni E on an ink square, with a red-pencil ∎. ∃ ("there exists") opens a proof; ∎ closes it. The E also reads as Erudent's initial.
- `erudent-mark.svg` (64px and up) carries faint construction lines — baseline, cap height, mean line, a compass circle — like a type specimen. `erudent-mark-small.svg` (below 64px) drops them.
- Header: the mark plus live "Erudent" in Archivo 800. The lockup and wordmark SVGs (`erudent-lockup-*`, `erudent-wordmark-*`) stay out of the UI until they're redrawn in Archivo.
- Never recolor, rotate, outline or add effects. Per-file usage is in the Logos group.

## Iconography

- No icon set. Use words and mathematical glyphs: ∃ ∎ ✓ ✗ → · №.
