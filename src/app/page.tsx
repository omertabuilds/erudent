import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Erudent — ranked math duels",
};

const edge = "px-4 md:px-12";
const navLink = "inline-flex min-h-11 items-center text-[15px] font-medium text-text-muted hover:text-text";

const primary =
  "mt-8 inline-flex h-[46px] items-center rounded-(--radius-md) bg-text px-6 text-[15px] font-semibold text-bg hover:bg-text/90";

/** Open to everyone: signed-in players go straight to /play, visitors sign in first. */
async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

export default async function Home() {
  const user = await signedIn();
  const playHref = user ? "/play" : "/login?next=/play";

  return (
    // Always dark: the copy sits on a night photograph in either theme.
    <div
      data-theme="dark"
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-bg font-ui text-[17px] leading-[26px] text-text"
    >
      <Image
        src="/images/mountain-hero.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover object-[50%_30%]"
      />
      {/* Scrim under the nav, and a heavy fade into the page at the bottom. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-b from-bg/80 to-transparent" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-[40%] bg-[linear-gradient(to_bottom,transparent_0%,color-mix(in_oklab,var(--bg)_75%,transparent)_55%,var(--bg)_100%)]"
      />

      <header className={`flex items-center justify-between py-5 md:py-7 ${edge}`}>
        <Link href="/" className="flex min-h-11 items-center gap-2.5">
          <span aria-hidden="true" className="text-[22px] leading-none font-bold">
            ∃
          </span>
          <span className="text-[17px] leading-none font-semibold tracking-[-0.02em]">Erudent</span>
        </Link>
        <nav aria-label="Site">
          <Link href={playHref} className={navLink}>
            {user ? "Play" : "Sign in"}
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pt-14 pb-16 text-center md:pt-22">
        <div className="relative flex w-full flex-col items-center">
          {/* Soft dark pool behind the copy and form so they read over the mountain. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[840px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(11,11,13,0.55),rgba(11,11,13,0))]"
          />
          <p className="font-mono text-[12px] leading-none tracking-[0.14em] text-text-muted">NOW OPEN</p>
          <h1 className="mt-[22px] max-w-[780px] text-[clamp(40px,8vw,64px)] leading-none font-semibold tracking-[-0.045em] text-balance">
            Rank among the sharpest minds.
          </h1>
          <p className="mt-[22px] max-w-[480px] text-[18px] leading-7 tracking-[-0.01em] text-[#b3afa6]">
            Timed 1v1 duels on competition problems. One global rank.
          </p>
          <Link href={playHref} className={primary}>
            Play now
          </Link>
        </div>
      </main>

      <footer className={`flex flex-wrap justify-between gap-3 py-6 text-[13px] text-text-muted ${edge}`}>
        <span>playerudent.com</span>
        <span>Math first. Code, medicine and physics next.</span>
      </footer>
    </div>
  );
}
