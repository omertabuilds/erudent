import Image from "next/image";
import Link from "next/link";
import type { MyPlayer, ProfileSummary, PublicPlayer, RecentMatch } from "@/lib/erudent";
import { eloSeries, headToHead, nextRank, PLACEMENT, tierFromRankName, timeAgoLong, winRate } from "@/lib/profile";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProfileHeader, { type Viewer } from "@/components/ProfileHeader";
import EloChart from "@/components/EloChart";
import RecentDuels from "@/components/RecentDuels";

const BANNER_FILES = ["rank-1-novice", "rank-2-apprentice", "rank-3-scholar", "rank-4-savant", "rank-5-sage", "rank-6-erudite"];
const mono = "font-mono text-[10px] tracking-[0.14em] text-[#6e6a62] uppercase";
const card = "rounded-(--radius-lg) border border-line p-5";
const num = (n: number) => n.toLocaleString("en-US");
const joinedFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A player's public profile: the rank banner faded into the page, picture and handle over it,
 * a mono stats row, then the Elo line and recent matches (left), mastery and head-to-head (right).
 */
export default function ProfileView({
  profile,
  details,
  matches,
  opponents,
  place,
  viewer,
  signedIn,
}: {
  profile: ProfileSummary;
  /** Tagline and picture from the public profiles row; null if it couldn't be read. */
  details: PublicPlayer | null;
  matches: RecentMatch[];
  opponents: Record<string, PublicPlayer>;
  /** Global place, or null during placement. */
  place: number | null;
  /** The signed-in player, if any. */
  viewer: MyPlayer | null;
  signedIn: boolean;
}) {
  const tier = tierFromRankName(profile.rank); // 0 during placement
  const ranked = tier >= 1;
  const now = Date.now();
  const isOwner = viewer?.username === profile.username;
  const h2h = viewer && !isOwner ? headToHead(matches, viewer.username) : null;

  const who: Viewer = isOwner
    ? { kind: "owner", player: viewer! }
    : signedIn
      ? { kind: "player", reportMatchId: h2h?.lastMatchId ?? null }
      : { kind: "signed-out" };

  // Stats: only those with data.
  const rate = winRate(profile.wins, profile.losses, profile.draws);
  const stats: { k: string; v: string; sr?: string }[] = [
    { k: "Elo", v: num(profile.elo) },
    ranked
      ? place !== null && { k: "Global", v: `#${num(place)}` }
      : { k: "Placement", v: `${Math.min(profile.matches_played, PLACEMENT)} / ${PLACEMENT}` },
    rate !== null && { k: "Win rate", v: `${rate}%` },
    profile.wins + profile.losses + profile.draws > 0 && {
      k: "W · L · D",
      v: `${profile.wins}·${profile.losses}·${profile.draws}`,
      sr: `${profile.wins} wins, ${profile.losses} losses, ${profile.draws} draws`,
    },
    { k: "Matches", v: num(profile.matches_played) },
  ].filter((s): s is { k: string; v: string; sr?: string } => !!s);

  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
      <SiteHeader />

      <main className="flex-[1_0_auto]">
        <div aria-hidden="true" className="relative h-[260px] overflow-hidden md:h-[320px]">
          <Image
            src={`/images/banners/${BANNER_FILES[(ranked ? tier : 1) - 1]}.jpg`}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_60%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(11,11,13,0.4)_0%,rgba(11,11,13,0)_25%,rgba(11,11,13,0.4)_55%,rgba(11,11,13,0.9)_82%,var(--bg)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(11,11,13,0.75)_0%,rgba(11,11,13,0)_45%)]" />
        </div>

        <div className="relative mx-auto -mt-[140px] flex max-w-[1200px] flex-col gap-7 px-4 pb-16 md:-mt-[150px] md:px-10">
          <ProfileHeader
            username={profile.username}
            tier={tier}
            tagline={details?.tagline ?? null}
            pictureUrl={details?.avatar_url ?? null}
            joined={joinedFmt.format(new Date(profile.created_at))}
            viewer={who}
          />

          <dl className="flex flex-wrap overflow-hidden rounded-(--radius-lg) border border-line">
            {stats.map((s) => (
              <div key={s.k} className="-mt-px -ml-px flex min-w-[140px] flex-1 flex-col-reverse border-t border-l border-line px-5 py-[18px]">
                <dt className={`mt-1 ${mono}`}>{s.k}</dt>
                <dd className="font-mono text-[22px] leading-7 font-semibold tracking-[-0.03em] tabular-nums">
                  {s.sr ? (
                    <>
                      <span aria-hidden="true">{s.v}</span>
                      <span className="sr-only">{s.sr}</span>
                    </>
                  ) : (
                    s.v
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
              <EloChart points={eloSeries(matches)} next={ranked ? nextRank(profile.elo) : null} />
              <RecentDuels matches={matches} opponents={opponents} now={now} />
            </div>

            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
              <section aria-labelledby="mastery-title" className={`${card} flex flex-col gap-3.5`}>
                <h2 id="mastery-title" className={`font-normal ${mono}`}>
                  Mastery
                </h2>
                <p className="text-[14px] leading-[21px] text-text-muted">
                  Mastery by topic is on its way: arithmetic, algebra and the rest, scored from every duel and practice question.
                </p>
                <Link href="/play" className="inline-flex min-h-11 items-center self-start text-[13px] text-text-muted hover:text-text">
                  Full mastery map →
                </Link>
              </section>

              {h2h && (
                <section aria-labelledby="h2h-title" className={`${card} flex flex-col gap-3`}>
                  <h2 id="h2h-title" className={`font-normal ${mono}`}>
                    You vs {profile.username}
                  </h2>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="font-mono text-[28px] leading-none font-semibold tabular-nums">
                      <span aria-hidden="true">
                        {h2h.wins} – {h2h.losses}
                        {h2h.draws > 0 && <span className="text-text-muted"> · {h2h.draws}D</span>}
                      </span>
                      <span className="sr-only">
                        You won {h2h.wins}, lost {h2h.losses}
                        {h2h.draws > 0 ? `, drew ${h2h.draws}` : ""}
                      </span>
                    </p>
                    <p className="text-[13px] text-[#8a867d]">Last met {timeAgoLong(h2h.lastAt, now)}</p>
                  </div>
                  <p className="text-[12px] text-[#6e6a62]">From @{profile.username}&apos;s last {matches.length} duels.</p>
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
