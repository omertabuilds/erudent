/** Shared class strings for the player pages (practice, lobby). See erudent-design/DESIGN-SYSTEM.md. */

export const kicker = "text-[13px] leading-none font-semibold tracking-[0.08em] text-ink-muted uppercase";

/** A surface panel edged with a hairline. */
export const panel = "flex flex-col rounded-(--r-md) border border-hairline bg-surface p-6 md:p-8";
/** The practice problem sheet: a panel that holds its height between states. */
export const sheet = `${panel} min-h-[420px]`;

export const secondary =
  "inline-flex h-11 items-center rounded-(--r-md) border border-rule px-5 text-[15px] font-bold text-ink hover:border-ink disabled:hover:border-rule";
export const quiet = "inline-flex min-h-11 items-center text-[15px] font-semibold text-ink-muted hover:text-ink";

export const pill = (selected: boolean) =>
  `inline-flex h-11 items-center rounded-(--r-pill) border px-4 text-[15px] font-semibold disabled:opacity-40 ${
    selected ? "border-ink bg-ink text-on-ink" : "border-rule text-ink hover:border-ink"
  }`;

export const caption = "text-[13px] leading-[18px] text-ink-muted";
export const cardTitle = "text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em]";
