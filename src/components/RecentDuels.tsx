import Link from "next/link";
import type { PublicPlayer, RecentMatch } from "@/lib/erudent";
import { tierOf, timeAgo, timeAgoLong } from "@/lib/profile";
import RankBadge, { type Rank } from "@/components/RankBadge";

const RESULT = {
  win: { letter: "W", word: "Win", tone: "text-text" },
  loss: { letter: "L", word: "Loss", tone: "text-[#6e6a62]" },
  draw: { letter: "D", word: "Draw", tone: "text-[#6e6a62]" },
} as const;

/** Only the unusual modes get a tag; ranked is the default. */
const MODE_TAG = { ranked: null, async: "Run", friend: "Friend" } as const;
const MODE_WORD = { ranked: "Ranked", async: "Recorded run", friend: "Friend game" } as const;

const mono = "font-mono text-[10px] tracking-[0.14em] text-[#6e6a62] uppercase";
const fullDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Gains in the Apprentice green with +N; losses muted with −N. Never color alone. */
function EloChange({ m }: { m: RecentMatch }) {
  if (m.mode === "friend") return <span className="text-[#6e6a62]">unrated</span>;
  if (m.elo_after === null) return <span className="text-[#6e6a62]">—</span>;
  const d = m.elo_after - m.elo_before;
  const sr = <span className="sr-only"> Elo</span>;
  if (d > 0) return <span className="text-[var(--rank-2-text)]">+{d}{sr}</span>;
  if (d < 0) return <span className="text-text-muted">−{-d}{sr}</span>;
  return <span className="text-text-muted">±0{sr}</span>;
}

/**
 * Recent matches, newest first: result, opponent in their rank's color with the badge,
 * score, Elo change, time ago. Opponent ranks are their current rank.
 */
export default function RecentDuels({
  matches,
  opponents,
  now,
}: {
  matches: RecentMatch[];
  opponents: Record<string, PublicPlayer>;
  now: number;
}) {
  return (
    <section aria-labelledby="recent-title" className="overflow-hidden rounded-(--radius-lg) border border-line">
      <h2 id="recent-title" className={`border-b border-line px-5 py-3.5 font-normal ${mono}`}>
        Recent matches
      </h2>
      {matches.length === 0 ? (
        <p className="px-5 py-6 text-[14px] text-text-muted">No duels yet.</p>
      ) : (
        <ol>
          {matches.map((m) => {
            const r = m.result ? RESULT[m.result] : null;
            const opp = m.opponent ? opponents[m.opponent] : undefined;
            const tier = opp ? tierOf(opp.elo, opp.matches_played) : 0;
            const tag = MODE_TAG[m.mode];
            return (
              <li
                key={m.match_id}
                className="grid grid-cols-[20px_minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 border-t border-[#141418] px-4 py-[11px] first:border-t-0 sm:grid-cols-[28px_minmax(0,1fr)_56px_64px_72px] sm:px-5"
              >
                <span className={`font-mono text-[12px] font-semibold ${r?.tone ?? "text-[#6e6a62]"}`}>
                  <span aria-hidden="true">{r?.letter ?? "—"}</span>
                  <span className="sr-only">{r?.word ?? "No result"}</span>
                </span>

                <div className="flex min-w-0 items-center gap-2">
                  {tier > 0 && <RankBadge rank={tier as Rank} size={16} className="flex-none" />}
                  {m.opponent ? (
                    <Link
                      href={`/u/${encodeURIComponent(m.opponent)}`}
                      className="-my-2 inline-flex min-h-11 min-w-0 items-center py-2 text-[14px] font-medium underline-offset-4 hover:underline"
                      style={{ color: tier ? `var(--rank-${tier}-text)` : "var(--text)" }}
                    >
                      <span className="sr-only">against </span>
                      <span className="truncate">{m.opponent}</span>
                    </Link>
                  ) : (
                    <span className="text-[14px] text-text-muted">No opponent</span>
                  )}
                  {tag ? (
                    <span className="flex-none font-mono text-[10px] tracking-[0.1em] text-[#6e6a62] uppercase">
                      <span aria-hidden="true">{tag}</span>
                      <span className="sr-only">, {MODE_WORD[m.mode]}</span>
                    </span>
                  ) : (
                    <span className="sr-only">, {MODE_WORD[m.mode]}</span>
                  )}
                </div>

                <span className="text-right font-mono text-[13px] text-text-muted tabular-nums">
                  {m.opponent_score === null ? (
                    "—"
                  ) : (
                    <>
                      <span className="sr-only">Score </span>
                      {m.score}–{m.opponent_score}
                    </>
                  )}
                </span>

                <span className="text-right font-mono text-[13px] tabular-nums">
                  <EloChange m={m} />
                </span>

                <time
                  dateTime={m.finished_at}
                  title={fullDate.format(new Date(m.finished_at))}
                  className="text-right font-mono text-[12px] text-[#6e6a62] tabular-nums"
                >
                  <span aria-hidden="true">{timeAgo(m.finished_at, now) === "now" ? "now" : `${timeAgo(m.finished_at, now)} ago`}</span>
                  <span className="sr-only">{timeAgoLong(m.finished_at, now)}</span>
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
