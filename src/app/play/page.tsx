import type { Metadata } from "next";
import { requirePlayer } from "@/lib/session";
import { api, TIER_NAMES, type RecentMatch } from "@/lib/erudent";
import { SiteHeaderView } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import LobbyBanner from "@/components/LobbyBanner";
import Lobby from "@/components/Lobby";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Play — Erudent",
};

const card = "min-w-0 rounded-(--radius-lg) border border-line bg-surface";
const label = "font-mono text-[11px] tracking-[0.08em] text-text-muted uppercase";

const ARENAS = ["Code", "Medicine", "Physics"];

export default async function PlayPage() {
  const { supabase, profile } = await requirePlayer("/play");
  const [{ data: rank }, place, recent] = await Promise.all([
    supabase.rpc("rank_name", { p_elo: profile.elo, p_matches: profile.matches_played }),
    api.playerPlace(supabase, profile.username).catch(() => null),
    api.recentMatches(supabase, profile.username).catch(() => [] as RecentMatch[]),
  ]);
  // 1–6 once placed; 0 while placement hides the rank ("Unranked").
  const tier = TIER_NAMES.indexOf(rank as (typeof TIER_NAMES)[number]) + 1;

  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
      <SiteHeaderView state="player" current="play" />

      <main className="flex-[1_0_auto]">
        <LobbyBanner player={profile} tier={tier} place={place} />

        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 pt-2 pb-16 md:px-10 md:pb-24">
          <div role="tablist" aria-label="Arena" className="flex flex-wrap gap-1 border-b border-line">
            <button
              type="button"
              role="tab"
              id="arena-math"
              aria-selected="true"
              aria-controls="arena-math-panel"
              className="-mb-px border-b-2 border-text px-3.5 py-2.5 text-[14px] font-semibold"
            >
              Mathematics
            </button>
            {ARENAS.map((a) => (
              <button key={a} type="button" role="tab" aria-selected="false" disabled className="px-3.5 py-2.5 text-[14px] text-[#6e6a62]">
                {a} <span className="font-mono text-[11px]">SOON</span>
              </button>
            ))}
          </div>

          <div id="arena-math-panel" role="tabpanel" aria-labelledby="arena-math" className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex min-w-0 flex-[2_1_520px] flex-col [&>section]:flex-1">
                <Lobby />
              </div>
              <RatingCard recent={recent} elo={profile.elo} />
            </div>

            <section aria-labelledby="mastery-title" className="mt-2">
              <h2 id="mastery-title" className="font-mono text-[11px] tracking-[0.12em] text-[#6e6a62]">
                MASTERY
              </h2>
              {/* Placeholder: the mastery map lands in its own PR. */}
              <div className="mt-2 flex aspect-[1200/560] w-full items-center justify-center rounded-(--radius-lg) border border-dashed border-line">
                <p className="text-[13px] text-text-muted">Your mastery map will appear here.</p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Elo over the last 30 days, from rated duels (ranked and async; friend games don't move Elo).
 * Built from the recent-duels feed, so it covers at most the last 10 finished duels.
 */
function RatingCard({ recent, elo }: { recent: RecentMatch[]; elo: number }) {
  // Server-rendered per request (force-dynamic), so "now" is the request time.
  const since = Date.now() - 30 * DAY;
  const rated = recent
    .filter((m) => m.mode !== "friend" && m.elo_after !== null && new Date(m.finished_at).getTime() >= since)
    .sort((a, b) => a.finished_at.localeCompare(b.finished_at));
  const series = rated.length ? [rated[0].elo_before, ...rated.map((m) => m.elo_after!)] : [];
  const delta = series.length ? elo - series[0] : 0;

  const W = 300;
  const H = 56;
  const lo = Math.min(...series);
  const span = Math.max(...series) - lo || 1;
  const pts = series.map((v, i) => [(i / Math.max(1, series.length - 1)) * W, H - 8 - ((v - lo) / span) * (H - 16)] as const);
  const signed = delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "±0";

  return (
    <section aria-labelledby="rating-title" className={`${card} flex flex-[1_1_300px] flex-col gap-2.5 px-5 py-[18px]`}>
      <div className="flex items-baseline justify-between">
        <h2 id="rating-title" className={label}>
          Rating · 30D
        </h2>
        {series.length > 1 && (
          <span className={`font-mono text-[12px] tabular-nums ${delta > 0 ? "text-[var(--rank-2-text)]" : "text-text-muted"}`}>{signed}</span>
        )}
      </div>
      {series.length > 1 ? (
        <svg role="img" aria-label={`Elo trend, ${signed} over 30 days`} viewBox={`0 0 ${W} ${H}`} className="h-14 w-full overflow-visible">
          <polyline
            points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--text)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2.5" fill="var(--text)" />
        </svg>
      ) : (
        <p className="flex h-14 items-center text-[13px] text-text-muted">No rated duels in the last 30 days.</p>
      )}
    </section>
  );
}
