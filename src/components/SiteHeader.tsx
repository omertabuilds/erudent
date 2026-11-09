import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";

export const gutter = "px-[clamp(20px,4vw,56px)]";

const link = "inline-flex min-h-11 items-center px-2 text-[15px] whitespace-nowrap sm:px-3 font-semibold text-ink-muted hover:text-ink";
// Secondary style: the page's one primary button is EarlyAccess's.
const action =
  "inline-flex h-11 items-center rounded-(--r-md) border border-rule px-4 text-[15px] font-bold whitespace-nowrap sm:px-5 text-ink hover:border-ink";

/**
 * Lockup left; "How it works" and one action right.
 * Signed out → Sign in. Signed in with a redeemed code → Play.
 * Signed in without access → no action: the EarlyAccess box on the page is the way in.
 */
export default async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await api.hasAccess(supabase).catch(() => false) : false;

  return (
    <header className={`relative z-10 flex items-center justify-between gap-3 py-5 ${gutter}`}>
      <Link href="/" className="flex flex-none items-center gap-3">
        <Image src="/logos/erudent-mark-small.svg" alt="" width={36} height={36} className="block size-9" />
        <span className="text-[22px] leading-none font-extrabold tracking-[-0.02em] max-[359px]:sr-only">Erudent</span>
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
        {/* A plain anchor on purpose: Lenis smooth-scrolls "/#…" links on the landing page,
            and next/link would run its own hash scroll on top of it. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/#how-it-works" className={link}>
          How it works
        </a>
        {!user ? (
          <Link href="/login?next=/play" className={action}>
            Sign in
          </Link>
        ) : access ? (
          <Link href="/play" className={action}>
            Play
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
