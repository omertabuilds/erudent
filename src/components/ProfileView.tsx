import Image from "next/image";
import Link from "next/link";
import type { ProfileSummary, RecentMatch } from "@/lib/erudent";
import Avatar from "@/components/Avatar";
import RecentDuels from "@/components/RecentDuels";

const gutter = "px-[clamp(16px,4vw,56px)]";

/** A player's public profile: who they are, where they stand, their last ten duels. */
export default function ProfileView({ profile, matches }: { profile: ProfileSummary; matches: RecentMatch[] }) {
  const placementLeft = Math.max(0, 10 - profile.matches_played);

  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <header className={`flex items-center justify-between gap-3 border-b border-hairline py-5 ${gutter}`}>
        <Link href="/" className="flex min-h-11 items-center gap-3">
          <Image src="/logos/erudent-mark-small.svg" alt="" width={36} height={36} className="block size-9" />
          <span className="text-[22px] leading-none font-extrabold tracking-[-0.02em]">Erudent</span>
        </Link>
        <Link href="/play" className="inline-flex min-h-11 items-center text-[15px] font-semibold underline-offset-4 hover:underline">
          Play
        </Link>
      </header>

      <main className={`w-full max-w-[760px] py-12 sm:py-16 ${gutter}`}>
        <section className="flex flex-wrap items-center gap-x-8 gap-y-6">
          <Avatar username={profile.username} />
          <div className="min-w-0">
            <h1 className="text-[clamp(36px,7vw,56px)] leading-none font-extrabold tracking-[-0.03em] break-all">
              @{profile.username}
            </h1>
            <p className="mt-3 text-[19px] leading-[29px]">
              <span className="font-semibold">{profile.rank}</span>
              <span className="text-ink-muted"> · </span>
              <span className="tabular-nums lining-nums">{profile.elo}</span> Elo
              {placementLeft > 0 && (
                <span className="text-ink-muted">
                  {" "}
                  · {placementLeft} placement {placementLeft === 1 ? "duel" : "duels"} left
                </span>
              )}
            </p>
            <p className="mt-1 text-[15px] text-ink-muted tabular-nums lining-nums">
              {profile.wins} W · {profile.losses} L · {profile.draws} D
            </p>
          </div>
        </section>

        <section className="mt-16" aria-labelledby="recent-duels">
          <h2 id="recent-duels" className="text-[13px] font-semibold tracking-[.08em] text-ink-muted uppercase">
            Recent duels
          </h2>
          <RecentDuels matches={matches} />
        </section>
      </main>
    </div>
  );
}
