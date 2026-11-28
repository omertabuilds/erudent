import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";
import EnterCodeLink from "@/components/EnterCodeLink";

export const gutter = "px-[clamp(20px,4vw,56px)]";

const link = "inline-flex min-h-11 items-center px-1.5 text-[15px] font-semibold whitespace-nowrap text-ink-muted hover:text-ink sm:px-3";
// Secondary style: the page's one primary button is EarlyAccess's.
const action =
  "inline-flex h-11 items-center rounded-(--r-md) border border-rule px-3 text-[15px] font-bold whitespace-nowrap text-ink hover:border-ink sm:px-5";
const small = "inline-flex min-h-11 cursor-pointer items-center px-1.5 sm:px-2 text-[13px] font-semibold whitespace-nowrap text-ink-muted hover:text-ink";

export type HeaderState = "signed-out" | "no-access" | "player" | "setup";

/**
 * Lockup left; Rules, Rankings and the action for this visitor right.
 * - signed out → Sign in
 * - signed in with a redeemed code → Settings (hidden on phones: the lobby banner's gear links there) and Play
 * - signed in without one → Enter code (opens the code tab below) and Sign out,
 *   for someone signed in with the wrong account
 * - signed in, still choosing a username (onboarding, rename) → Sign out only

 */
export default async function SiteHeader({ current }: { current?: Current } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await api.hasAccess(supabase).catch(() => false) : false;
  return <SiteHeaderView state={!user ? "signed-out" : access ? "player" : "no-access"} current={current} />;
}

/** `current` marks the page you're on: its link drops the button look and gets aria-current. */
type Current = "play" | "rankings" | "settings";

export function SiteHeaderView({ state, current }: { state: HeaderState; current?: Current }) {
  return (
    <header className={`relative z-10 flex items-center justify-between gap-2 py-5 sm:gap-3 ${gutter}`}>
      <Link href="/" className="flex flex-none items-center gap-2 sm:gap-3">
        <Image src="/logos/erudent-mark-small.svg" alt="" width={36} height={36} className="block size-9" />
        <span className="text-[22px] leading-none font-extrabold tracking-[-0.02em] max-[359px]:sr-only">Erudent</span>
      </Link>
      <nav className="flex items-center sm:gap-2" aria-label="Site">
        <Link href="/rules" className={`${link} ${state === "no-access" ? "max-sm:hidden" : ""}`}>
          Rules
        </Link>
        <Link
          href="/rankings"
          aria-current={current === "rankings" ? "page" : undefined}
          className={`${link} aria-[current=page]:text-ink ${state === "no-access" ? "max-sm:hidden" : ""}`}
        >
          Rankings
        </Link>
        {state === "signed-out" && (
          <Link href="/login?next=/play" className={action}>
            Sign in
          </Link>
        )}
        {state === "player" && (
          <Link
            href="/settings"
            aria-current={current === "settings" ? "page" : undefined}
            className={`${link} aria-[current=page]:text-ink max-sm:hidden`}
          >
            Settings
          </Link>
        )}
        {state === "player" &&
          (current === "play" ? (
            <Link href="/play" aria-current="page" className={`${link} aria-[current=page]:text-ink`}>
              Play
            </Link>
          ) : (
            <Link href="/play" className={action}>
              Play
            </Link>
          ))}
        {state === "no-access" && <EnterCodeLink className={action} />}
        {(state === "no-access" || state === "setup") && (
          <form action="/auth/signout" method="post">
            <button type="submit" className={small}>
              Sign out
            </button>
          </form>
        )}
      </nav>
    </header>
  );
}
