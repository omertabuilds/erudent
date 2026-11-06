Erudent is a competitive problem-solving arena — 1v1 duels, Elo, ranked tiers. The identity is **The Proof**: it takes its prestige from mathematics itself, not from universities. Ink, paper and one red pencil. It should read like a journal of record that happens to keep score.

## Principles

- **Borrow nothing.** No school colors, crests, seals, Latin, roman-numeral dates or "EST." lines. Every motif comes from mathematics: ∃, ∎, theorems, numbered statements, construction lines.
- **Monochrome first.** A screen is `paper` and `ink`. `pencil` is the one color, used the way a grader uses a red pencil: small, rare, meaningful.
- **Printed, not rendered.** No shadows, gradients, glass, glow or blur. Separate with `hairline` rules and space.
- **No rounded corners.** `radius-none` everywhere; `radius-full` only for avatars.
- **Quiet confidence.** Large Bodoni, generous space (`space-32` between sections), short sentences. Say less.

## Not vibecoded

Never ship: rounded cards with soft shadows; a 3-up grid of icon + title + blurb; pill badges with a colored dot; gradient or glowing text; emoji; a "New" chip above the hero; Inter, Geist or system-ui as the main face; Lucide icons as decoration; centered-everything layouts; numbers in a mono font; filler stats; "unlock", "supercharge", "level up".

Do: left-aligned asymmetric grids; numbered statements (Theorem 1, 2, 3) instead of feature cards; true small caps; lining tabular figures for anything that counts; one ∎ to close a section.

## Voice

- Precise, spare, dry. Write like a theorem: claim, then proof. "There exists a faster solver than you. Find out who."
- Sentence case. `eyebrow` small caps for kickers. No exclamation marks, no emoji.
- Results are stated, not celebrated: "Victory, by two problems to one." "+18 ∎". "Defeat · −12".
- ∎ ends a result, a section or a proof. Never use it as a bullet.

## Color

- Dark is the default; Light is paper. Set `data-theme` on `<html>`.
- `paper` page; `surface` sheets and panels, edged with `hairline`; `sunken` answer fields.
- `ink` text; `ink-muted` secondary text and losses.
- Primary button: `ink` fill, `on-ink` text, square. One per screen. Secondary button: transparent, 1px `rule` border, `ink` text.
- `pencil` for: Elo gains, ✓, the ∎, the timer under 0:30, at most one emphasized word in a headline. Never a large fill, never a button.
- Wins and losses: gains in `pencil` with "+N" or ✓; losses in `ink-muted` with "−N" or ✗. Never color alone.
- Focus: 2px solid `focus`, 2px offset.

## Type

- Google Fonts: Bodoni Moda (opsz 6–96, 400–500), Source Serif 4 (400, 500, italic 400), Source Sans 3 (400, 600). Set `font-optical-sizing: auto` so Bodoni sharpens at display sizes.
- `display-xl` hero and verdict; `display` section openers; `title` card titles, "Problem II"; `heading` subsections.
- `body-lg` problem statements and ledes (max 640px measure); `body` default; `body-sm` secondary.
- `eyebrow` with `font-variant: all-small-caps`. `theorem`: "Theorem 1." in 500 upright, the claim in italic.
- `label` for buttons, tabs and form labels; `caption` for fine print. The sans appears nowhere else.
- `score`, `timer`, `numeric`: `font-variant-numeric: lining-nums tabular-nums`.
- Math in KaTeX's default fonts (Computer Modern), unstyled — it already belongs here.

## Space and layout

- 4px base: `space-1` … `space-32`. Sheet padding `space-6`; gutter `space-4` mobile, `space-16` desktop; sections `space-32` apart on desktop.
- 12-column grid, 1200px max, left-aligned. Text sits in columns 1–7; columns 9–12 carry margin notes, figures or the result sheet.
- Header: lockup left, two text links and the primary button right, a `hairline` rule beneath.

## Logo

- The mark is **∃∎**: a mirrored Bodoni E on an ink square, with a red-pencil ∎. ∃ ("there exists") opens a proof; ∎ closes it. The E also reads as Erudent's initial.
- `erudent-mark.svg` (64px and up) carries faint construction lines — baseline, cap height, mean line, a compass circle — like a type specimen. `erudent-mark-small.svg` (below 64px) drops them.
- Header: `erudent-lockup-paper.svg` in Dark, `erudent-lockup-ink.svg` in Light. Wordmark alone: `erudent-wordmark-*`.
- Never recolor, rotate, outline or add effects. Per-file usage is in the Logos group.

## Iconography

- No icon set. Use words and mathematical glyphs: ∃ ∎ ✓ ✗ → · №.
