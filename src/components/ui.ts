/** Shared class strings for the player pages (practice, lobby, match). See erudent-design/DESIGN-SYSTEM.md. */

export const kicker = "text-[13px] leading-none font-semibold tracking-[0.08em] text-ink-muted uppercase";

/** The practice problem sheet: the one bordered surface on a player page. */
export const sheet = "flex min-h-[420px] flex-col rounded-(--r-md) border border-hairline bg-surface p-6 md:p-8";

export const secondary =
  "inline-flex h-11 items-center rounded-(--r-md) border border-rule px-5 text-[15px] font-bold text-ink hover:border-ink disabled:hover:border-rule";
export const quiet = "inline-flex min-h-11 items-center text-[15px] font-semibold text-ink-muted hover:text-ink";

export const caption = "text-[13px] leading-[18px] text-ink-muted";

/** The one primary button on a screen: ink fill, on-ink text. */
export const primary =
  "inline-flex h-14 flex-none items-center justify-center rounded-(--r-md) bg-ink px-6 text-[15px] font-bold text-on-ink disabled:opacity-40";

/** Section-title size: page headlines below the landing hero. */
export const title = "text-[clamp(36px,5vw,56px)] leading-none font-extrabold tracking-[-0.03em]";

/** Form label: 15px, 600. */
export const label = "text-[15px] leading-[22px] font-semibold text-ink";

/** Text and date inputs: a sunken well, r-md, hairline edge. */
export const field =
  "h-14 w-full min-w-0 rounded-(--r-md) border border-hairline bg-sunken px-4 text-[17px] leading-normal text-ink placeholder:text-ink-muted placeholder:opacity-100 hover:border-rule aria-invalid:border-rule";
