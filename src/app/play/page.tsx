import type { Metadata } from "next";
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { api, TIER_NAMES, type MyPlayer, type PracticeStats } from "@/lib/erudent";
import { SiteHeaderView, gutter } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Avatar from "@/components/Avatar";
import Lobby from "@/components/Lobby";
import Reveal from "@/components/landing/Reveal";
import { caption, cardTitle, kicker, panel, secondary } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Play — Erudent",
};

const PLACEMENT = 10;

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "—");

export default async function PlayPage() {
  const { supabase, profile } = await requirePlayer("/play");
  const [{ data: rank }, stats] = await Promise.all([
    supabase.rpc("rank_name", { p_elo: profile.elo, p_matches: profile.matches_played }),
    api.practiceStats(supabase).catch(() => null),
  ]);
  const rankName = (rank as string | null) ?? "Unranked";
  // 1–6 once placed; 0 while placement hides the rank ("Unranked").
  const tier = TIER_NAMES.indexOf(rankName as (typeof TIER_NAMES)[number]) + 1;

  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <noscript>
        <style>{`.reveal{opacity:1;transform:none}`}</style>
      </noscript>

      <SiteHeaderView state="player" />

      <main className={`mx-auto w-full max-w-[1312px] flex-[1_0_auto] pt-10 pb-24 md:pt-16 md:pb-32 ${gutter}`}>
        <h1 className="sr-only">Play</h1>

        <div className="grid gap-12 md:grid-cols-12 md:gap-x-8 lg:gap-x-16">
          <div className="md:col-span-4">
            <PlayerCard profile={profile} rank={rankName} />
          </div>

          <div className="flex min-w-0 flex-col gap-12 md:col-span-8 md:gap-16">
            <Lobby streak={stats?.streak ?? 0} />
            <Reveal>
              <Ledger stats={stats} />
            </Reveal>
            <Reveal>
              <MasteryTree tier={tier} stats={stats} />
            </Reveal>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function PlayerCard({ profile, rank }: { profile: MyPlayer; rank: string }) {
  const placementLeft = Math.max(0, PLACEMENT - profile.matches_played);

  return (
    <section aria-label="Your profile" className={`${panel} lg:sticky lg:top-8`}>
      {/* Phone: avatar beside the name. md+: a vertical column. */}
      <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-6">
        <span className="md:hidden">
          <Avatar username={profile.username} size={56} />
        </span>
        <span className="hidden md:inline-flex">
          <Avatar username={profile.username} size={96} />
        </span>
        <div className="min-w-0">
          <p className={`${cardTitle} break-all`}>@{profile.username}</p>
          <p className="mt-1 font-semibold">{rank}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 md:mt-8 md:flex-col md:items-start">
        {placementLeft > 0 ? (
          <p className="text-[22px] leading-[28px] font-extrabold tracking-[-0.01em] tabular-nums">
            {placementLeft} placement {placementLeft === 1 ? "duel" : "duels"} left
          </p>
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="text-[56px] leading-[1] font-extrabold tracking-[-0.03em] tabular-nums">{profile.elo}</span>
            <span className="text-[15px] font-semibold text-ink-muted">Elo</span>
          </p>
        )}
        <p className="font-semibold tabular-nums" aria-label={`${profile.wins} wins, ${profile.losses} losses, ${profile.draws} draws`}>
          {profile.wins}W · {profile.losses}L · {profile.draws}D
        </p>
      </div>

      <dl className="mt-6 border-t border-hairline max-md:hidden">
        {[
          ["Matches played", `${profile.matches_played}`],
          ["Win rate", pct(profile.wins, profile.matches_played)],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-hairline py-3">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <Link href={`/u/${encodeURIComponent(profile.username)}`} className={`${secondary} mt-6 justify-center md:self-start`}>
        View profile
      </Link>
    </section>
  );
}

function Ledger({ stats }: { stats: PracticeStats | null }) {
  const attempted = stats?.attempted ?? 0;
  const rows: [string, string][] = [
    ["Attempted", `${attempted}`],
    ["Accuracy", pct(stats?.correct ?? 0, attempted)],
    ["Best streak", `${stats?.best_streak ?? 0}`],
  ];

  return (
    <section aria-labelledby="record-title">
      <h2 id="record-title" className={kicker}>
        Practice record
      </h2>
      <dl className="mt-3 max-w-[440px] border-t border-hairline">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-hairline py-3">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The six ranks as a chain, Novice at the foot and Erudite at the head, joined by construction lines.
 * Your rank is inked in; ranks below it are reached; ranks above are hairline.
 * Each node carries your practice accuracy at that tier.
 */
function MasteryTree({ tier, stats }: { tier: number; stats: PracticeStats | null }) {
  // TODO: per-topic mastery (a node per topic within each tier) needs a per-topic stats RPC.
  const byTier = new Map((stats?.by_tier ?? []).map((t) => [t.tier, t]));

  return (
    <section aria-labelledby="mastery-title">
      <h2 id="mastery-title" className={kicker}>
        Mastery
      </h2>

      {/* DOM order climbs from Novice; flex-col-reverse draws Erudite on top. */}
      <ol className="mt-6 flex max-w-[440px] flex-col-reverse">
        {TIER_NAMES.map((name, i) => {
          const n = i + 1;
          const state = n === tier ? "current" : n < tier ? "reached" : "unreached";
          const t = byTier.get(n);
          return (
            <li key={name} className="flex flex-col-reverse">
              {n > 1 && <span aria-hidden="true" className="ml-8 block h-6 w-px bg-hairline" />}
              <div
                className={`flex min-h-14 items-center justify-between gap-4 rounded-(--r-md) border px-5 ${
                  state === "current"
                    ? "border-ink bg-ink text-on-ink"
                    : state === "reached"
                      ? "border-ink text-ink"
                      : "border-hairline text-ink-muted"
                }`}
              >
                <span className="font-semibold">
                  {name}
                  {n === TIER_NAMES.length && tier >= n && (
                    <span className="ml-2 text-pencil" aria-hidden="true">
                      ∎
                    </span>
                  )}
                  <span className="sr-only">
                    {state === "current" ? " (your rank)" : state === "reached" ? " (reached)" : " (not reached)"}
                  </span>
                </span>
                <span className="text-[15px] tabular-nums">
                  <span className="sr-only">Practice accuracy </span>
                  {t?.attempted ? pct(t.correct, t.attempted) : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <p className={`${caption} mt-4`}>
        {tier === 0 ? "Your rank is placed after ten ranked duels. " : ""}
        Practice accuracy per rank. Per-topic mastery is coming.
      </p>
    </section>
  );
}
