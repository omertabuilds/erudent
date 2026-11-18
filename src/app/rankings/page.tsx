import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { api, TIER_NAMES, type LeaderboardRow } from "@/lib/erudent";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RankBadge, { type Rank } from "@/components/RankBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rankings — Erudent",
};

const BANNER_FILES = ["rank-1-novice", "rank-2-apprentice", "rank-3-scholar", "rank-4-savant", "rank-5-sage", "rank-6-erudite"];
const mono = "font-mono text-[10px] tracking-[0.14em] text-[#6e6a62] uppercase";
// Real table layout (fixed columns) so screen readers keep row and column semantics.
const cell = "px-2 py-3 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5 align-middle";

/** 1–6 from the rank name the leaderboard returns (everyone listed is past placement). */
const tierOf = (rank: string) => Math.max(1, TIER_NAMES.indexOf(rank as (typeof TIER_NAMES)[number]) + 1);
const num = (n: number) => n.toLocaleString("en-US");

/** The global board: the top three as cards, then a table, and your row pinned if you're not in it. */
export default async function RankingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [board, me] = await Promise.all([
    api.leaderboard(supabase, 100).catch(() => [] as LeaderboardRow[]),
    user ? api.myPlayer(supabase).catch(() => null) : Promise.resolve(null),
  ]);

  // Your own row, pinned under the table when you're placed but outside the top 100.
  let pinned: LeaderboardRow | null = null;
  if (me && !board.some((r) => r.username === me.username)) {
    const [place, { data: rank }] = await Promise.all([
      api.playerPlace(supabase, me.username).catch(() => null),
      supabase.rpc("rank_name", { p_elo: me.elo, p_matches: me.matches_played }),
    ]);
    if (place !== null)
      pinned = { place, username: me.username, elo: me.elo, rank: (rank as string) ?? "Novice", wins: me.wins, losses: me.losses, draws: me.draws };
  }

  const podium = board.slice(0, 3);
  const rest = board.slice(3);

  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
      <SiteHeader current="rankings" />

      <main className="mx-auto flex w-full max-w-[1200px] flex-[1_0_auto] flex-col gap-7 px-4 pt-8 pb-16 md:px-10 md:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#6e6a62]">MATHEMATICS</p>
            <h1 className="mt-1.5 text-[40px] leading-none font-semibold tracking-[-0.045em]">Rankings</h1>
          </div>
          {/* Grade boards join this switch once school and grade verification exist. */}
          <div role="group" aria-label="Board" className="flex gap-1 rounded-(--radius-md) border border-line bg-surface p-[3px]">
            <button type="button" aria-pressed="true" className="h-8 rounded-[6px] bg-text px-3.5 text-[13px] font-medium text-bg">
              Global
            </button>
          </div>
        </div>

        {board.length === 0 ? (
          <p className="rounded-(--radius-lg) border border-line px-5 py-10 text-center text-[15px] text-text-muted">
            No one is ranked yet. Players appear here after 10 ranked matches.
          </p>
        ) : (
          <>
            <ol aria-label="Top three" className="grid gap-3 sm:grid-cols-3">
              {podium.map((p) => (
                <PodiumCard key={p.username} p={p} you={p.username === me?.username} />
              ))}
            </ol>

            {(rest.length > 0 || pinned) && (
              <div className="overflow-hidden rounded-(--radius-lg) border border-line">
                <table className="w-full table-fixed border-collapse">
                  <colgroup>
                    <col className="w-[60px] sm:w-[76px]" />
                    <col />
                    <col className="w-[96px] max-sm:hidden" />
                    <col className="w-[84px] sm:w-[104px]" />
                  </colgroup>
                  <caption className="sr-only">Global rankings from #4</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className={`${cell} py-2.5 ${mono} text-left font-normal`}>
                        Rank
                      </th>
                      <th scope="col" className={`${cell} py-2.5 ${mono} text-left font-normal`}>
                        Player
                      </th>
                      <th scope="col" className={`${cell} py-2.5 ${mono} text-right font-normal max-sm:hidden`}>
                        W–L
                      </th>
                      <th scope="col" className={`${cell} py-2.5 ${mono} text-right font-normal`}>
                        Elo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((r) => (
                      <Row key={r.username} r={r} you={r.username === me?.username} />
                    ))}
                    {pinned && (
                      <>
                        {rest.length > 0 && (
                          <tr aria-hidden="true" className="border-t border-line">
                            <td colSpan={4} className="px-5 py-2 font-mono text-[11px] tracking-[0.14em] text-[#55524c]">
                              · · ·
                            </td>
                          </tr>
                        )}
                        <Row r={pinned} you />
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-between gap-3 text-[12px] text-[#6e6a62]">
          <span>Ranked after 10 matches.</span>
          <Link href="/rules#ranks" className="text-text-muted hover:text-text">
            How ranks work →
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Initial on a raised circle with the rank-color ring. The leaderboard doesn't carry pictures. */
function Ring({ name, tier, size }: { name: string; tier: number; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-full bg-surface-raised leading-none font-semibold text-text"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), boxShadow: `0 0 0 2px var(--surface), 0 0 0 3.5px var(--rank-${tier})` }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function YouTag() {
  return <span className="flex-none rounded-(--radius-sm) bg-text px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] text-bg">YOU</span>;
}

function PodiumCard({ p, you }: { p: LeaderboardRow; you: boolean }) {
  const t = tierOf(p.rank);
  return (
    <li className="overflow-hidden rounded-(--radius-lg) border border-line bg-surface">
      <div className="relative h-[110px]">
        <Image src={`/images/banners/${BANNER_FILES[t - 1]}.jpg`} alt="" fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover object-[50%_62%]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_30%,var(--surface)_100%)]" />
        <span className="absolute top-3 left-4 font-mono text-[13px] font-semibold text-text">#{p.place}</span>
      </div>
      <div className="relative -mt-[22px] flex flex-col gap-2.5 px-4 pb-4">
        <div className="flex items-center gap-2.5">
          <Ring name={p.username} tier={t} size={44} />
          <RankBadge rank={t as Rank} size={28} />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/u/${p.username}`}
            className="truncate text-[16px] font-semibold tracking-[-0.02em] hover:underline"
            style={{ color: `var(--rank-${t}-text)` }}
          >
            {p.username}
          </Link>
          {you && <YouTag />}
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-2.5 font-mono">
          <span className="text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
            {num(p.elo)}
            <span className="sr-only"> Elo</span>
          </span>
          <span className="text-[11px] tracking-[0.08em] text-[#6e6a62] tabular-nums">
            {p.wins}–{p.losses}
            <span className="sr-only"> wins and losses</span>
          </span>
        </div>
      </div>
    </li>
  );
}

function Row({ r, you }: { r: LeaderboardRow; you: boolean }) {
  const t = tierOf(r.rank);
  return (
    <tr className={`border-t first:border-t-0 ${you ? "border-line bg-[#13131a]" : "border-[#141418]"}`}>
      <td className={`${cell} font-mono text-[13px] tabular-nums ${you ? "text-text" : "text-text-muted"}`}>#{num(r.place)}</td>
      <th scope="row" className={`${cell} text-left font-normal`}>
        <span className="flex min-w-0 items-center gap-2.5">
          <Ring name={r.username} tier={t} size={26} />
          <Link href={`/u/${r.username}`} className="truncate text-[14px] font-semibold hover:underline" style={{ color: `var(--rank-${t}-text)` }}>
            {r.username}
          </Link>
          <RankBadge rank={t as Rank} size={18} />
          {you && <YouTag />}
        </span>
      </th>
      <td className={`${cell} text-right font-mono text-[13px] text-[#8a867d] tabular-nums max-sm:hidden`}>
        {r.wins}–{r.losses}
      </td>
      <td className={`${cell} text-right font-mono text-[14px] font-semibold tabular-nums`}>{num(r.elo)}</td>
    </tr>
  );
}
