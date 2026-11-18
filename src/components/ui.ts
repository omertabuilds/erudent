/** Shared class strings. See erudent-design/DESIGN-SYSTEM.md. */

// The customize panel (ProfileBanner) on /play and /u.
export const secondary =
  "inline-flex h-11 items-center rounded-(--r-md) border border-rule px-5 text-[15px] font-bold text-ink hover:border-ink disabled:hover:border-rule";
export const quiet = "inline-flex min-h-11 items-center text-[15px] font-semibold text-ink-muted hover:text-ink";
export const caption = "text-[13px] leading-[18px] text-ink-muted";

// The auth pages (AuthShell): sign in, onboarding, rename.
/** Mono small caps: field labels, step labels, kickers on the auth pages. */
export const authLabel = "font-mono text-[11px] leading-4 tracking-[0.14em] text-text-muted uppercase";
/** The page heading inside the form. */
export const authTitle = "text-[30px] leading-[34px] font-semibold tracking-[-0.045em] text-balance";
/** Text inputs: 46px, 8px radius, surface fill. */
export const authField =
  "h-[46px] w-full min-w-0 rounded-(--radius-md) border border-[#33333a] bg-bg/70 px-3.5 text-[15px] leading-normal text-text placeholder:text-[#8a867d] placeholder:opacity-100 hover:border-text-muted aria-invalid:border-accent-text";
/** The one primary button: full width, text fill. */
export const authPrimary =
  "inline-flex h-[46px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-(--radius-md) bg-text px-[18px] text-[15px] font-semibold text-bg hover:bg-text/90 disabled:cursor-not-allowed disabled:opacity-50";
/** Small grey note under a field or the form. */
export const authNote = "text-[13px] leading-[18px] text-text-muted";
/** A form-level error. */
export const authError = "text-[14px] leading-5 font-medium text-accent-text";
