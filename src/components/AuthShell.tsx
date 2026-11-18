import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * The frame for sign-in and setup pages, like the landing: the mountain photograph behind,
 * scrim under the header, heavy fade at the foot; ∃ Erudent top-left; one centered 400px
 * panel. Always dark, since it sits on a night photograph. `aside` goes top-right (Sign out).
 */
export default function AuthShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div
      data-theme="dark"
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-bg font-ui text-[17px] leading-[26px] text-text"
    >
      <Image src="/images/mountain-hero.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover object-[50%_30%]" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-b from-bg/80 to-transparent" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-[40%] bg-[linear-gradient(to_bottom,transparent_0%,color-mix(in_oklab,var(--bg)_75%,transparent)_55%,var(--bg)_100%)]"
      />

      <header className="flex items-center justify-between px-4 py-5 md:px-12 md:py-7">
        <Link href="/" className="flex min-h-11 items-center gap-2.5">
          <span aria-hidden="true" className="text-[22px] leading-none font-bold">
            ∃
          </span>
          <span className="text-[17px] leading-none font-semibold tracking-[-0.02em]">Erudent</span>
        </Link>
        {aside}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pt-6 pb-20 md:pb-28">
        <div className="relative w-full max-w-[400px]">
          {/* Soft dark pool so the panel reads over the mountain. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[720px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(11,11,13,0.6),rgba(11,11,13,0))]"
          />
          <div className="rounded-(--radius-md) border border-[#2c2c33] bg-[rgba(15,15,18,0.82)] p-6 shadow-(--lift) backdrop-blur-sm md:p-7">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Sign out, for pages where you're signed in but not set up yet. */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-medium text-text-muted hover:text-text">
        Sign out
      </button>
    </form>
  );
}

/** Thin progress segments: `done` of `total` filled. */
export function Steps({ total, done, label }: { total: number; done: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-[3px] flex-1 rounded-full ${i < done ? "bg-text" : "bg-[#2c2c33]"}`} />
      ))}
    </div>
  );
}
