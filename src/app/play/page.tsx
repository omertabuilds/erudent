import type { Metadata } from "next";
import { requirePlayer } from "@/lib/session";
import { api, TIER_NAMES, type PracticeStats, type RecentMatch } from "@/lib/erudent";
import { SiteHeaderView, gutter } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProfileBanner from "@/components/ProfileBanner";
import Lobby from "@/components/Lobby";
import Reveal from "@/components/landing/Reveal";
import { caption } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Play — Erudent",
};

const PLACEMENT = 10;

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "—");
const num = (n: number) => n.toLocaleString("en-US");

/** Sentence-case label for a margin note. Not a kicker: the page keeps one of those. */
const note = "text-[13px] leading-[18px] font-semibold text-ink-muted";

export default async function PlayPage() {
  const { supabase, profile } = await requirePlayer("/play");
  const [{ data: rank }, stats, recent] = await Promise.all([
    supabase.rpc("rank_name", { p_elo: profile.elo, p_matches: profile.matches_played }),
    api.practiceStats(supabase).catch(() => null),
    api.recentMatches(supabase, profile.username).catch(() => [] as RecentMatch[]),
  ]);
  const rankName = (rank as string | null) ?? "Unranked";
  // 1–6 once placed; 0 while placement hides the rank ("Unranked").
  const tier = TIER_NAMES.indexOf(rankName as (typeof TIER_NAMES)[number]) + 1;
  const placementLeft = Math.max(0, PLACEMENT - profile.matches_played);
  const lastDuel = recent.find((m) => m.result !== null) ?? null;

  // "N to next rank" is left out: the Elo cut-offs live only in the database (tier_for_elo).
  const standing =
    placementLeft > 0 ? (
      <>
        <span className="font-semibold text-ink">Unranked.</span> {placementLeft} placement {placementLeft === 1 ? "duel" : "duels"} left.
      </>
    ) : (
      <>
        <span className="font-semibold text-ink">{rankName}.</span> {num(profile.elo)} Elo.
      </>
    );

  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <noscript>
        <style>{`.reveal{opacity:1;transform:none}`}</style>
      </noscript>

      <SiteHeaderView state="player" current="play" />

      <main className={`mx-auto w-full max-w-[1312px] flex-[1_0_auto] pt-6 pb-24 md:pt-10 md:pb-32 ${gutter}`}>
        <h1 className="sr-only">Play</h1>
        <ProfileBanner player={profile} rank={rankName} editable />

        <div className="mt-10 grid gap-16 md:mt-14 md:grid-cols-12 md:gap-x-8 lg:gap-x-16">
          <div className="min-w-0 md:col-span-7">
            <Lobby streak={stats?.streak ?? 0} standing={standing} />
            <Reveal className="mt-16 md:mt-24">
              <Ranks tier={tier} stats={stats} />
            </Reveal>
          </div>

          <aside aria-label="Your record" className="flex min-w-0 flex-col gap-10 md:col-span-4 md:col-start-9">
            {lastDuel && <LastDuel m={lastDuel} />}
            <PracticeRecord stats={stats} />
            <p className={`${caption} border-t border-hairline pt-4`}>Math. More subjects later.</p>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

const WORD = { win: "Victory", loss: "Defeat", draw: "Draw" } as const;
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Stated, not celebrated: "Victory, 4–2. +18 ∎" · "Defeat, 1–3. −12". */
function LastDuel({ m }: { m: RecentMatch }) {
  const d = m.elo_after === null ? null : m.elo_after - m.elo_before;
  return (
    <div className="border-t border-hairline pt-4">
      <p className={note}>Last duel</p>
      <p className="mt-2 font-semibold tabular-nums">
        {WORD[m.result!]}
        {m.opponent_score !== null && `, ${m.score}–${m.opponent_score}`}.{" "}
        {m.mode === "friend" ? (
          <span className="font-normal text-ink-muted">Unrated.</span>
        ) : d === null ? null : d > 0 ? (
          <span className="text-pencil">
            +{d}
            <span className="sr-only"> Elo</span> ∎
          </span>
        ) : (
          <span className="text-ink-muted">
            {d < 0 ? `−${-d}` : "±0"}
            <span className="sr-only"> Elo</span>
          </span>
        )}
      </p>
      <p className={caption}>
        {m.opponent ? `Against @${m.opponent} · ` : ""}
        <time dateTime={m.finished_at}>{day.format(new Date(m.finished_at))}</time>
      </p>
    </div>
  );
}

function PracticeRecord({ stats }: { stats: PracticeStats | null }) {
  const attempted = stats?.attempted ?? 0;
  const rows: [string, string][] = [
    ["Attempted", num(attempted)],
    ["Accuracy", pct(stats?.correct ?? 0, attempted)],
    ["Best streak", num(stats?.best_streak ?? 0)],
  ];
  return (
    <div className="border-t border-hairline pt-4">
      <p className={note}>Practice record</p>
      <dl className="mt-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-hairline py-2 last:border-b-0">
            <dt className="text-[15px] text-ink-muted">{k}</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The six ranks on one thin vertical rule, Erudite at the head, one tick each.
 * Your rank in ink 800; the rest ink-muted. Each carries your practice accuracy at that tier.
 */
function Ranks({ tier, stats }: { tier: number; stats: PracticeStats | null }) {
  // TODO: per-topic mastery (a tick per topic within each rank) needs a per-topic stats RPC.
  const byTier = new Map((stats?.by_tier ?? []).map((t) => [t.tier, t]));

  return (
    <section aria-labelledby="ranks-title" className="border-t border-hairline pt-6">
      <h2 id="ranks-title" className="font-semibold">
        The ranks
      </h2>

      {/* DOM order climbs from Novice; flex-col-reverse draws Erudite on top. */}
      <ol className="mt-6 ml-1 flex max-w-[360px] flex-col-reverse border-l border-rule">
        {TIER_NAMES.map((name, i) => {
          const n = i + 1;
          const current = n === tier;
          const t = byTier.get(n);
          return (
            <li key={name} className="relative flex items-baseline justify-between gap-6 py-2.5 pl-7">
              <span aria-hidden="true" className={`absolute top-1/2 left-0 h-px ${current ? "w-5 bg-ink" : "w-3 bg-rule"}`} />
              <span className={current ? "font-extrabold text-ink" : "text-ink-muted"}>
                {name}
                {n === TIER_NAMES.length && tier >= n && (
                  <span className="ml-2 text-pencil" aria-hidden="true">
                    ∎
                  </span>
                )}
                {current && <span className="sr-only"> (your rank)</span>}
              </span>
              <span className="text-[15px] text-ink-muted tabular-nums">
                <span className="sr-only">Practice accuracy </span>
                {t?.attempted ? pct(t.correct, t.attempted) : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      <p className={`${caption} mt-4 max-w-[360px]`}>
        {tier === 0 ? "Your rank is set after ten ranked duels. " : ""}
        Practice accuracy at each rank. Per-topic mastery is coming.
      </p>
    </section>
  );
}
