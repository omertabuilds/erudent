import Link from "next/link";
import type { RecentMatch } from "@/lib/erudent";

const RESULT = {
  win: { letter: "W", word: "Win", tone: "text-ink" },
  loss: { letter: "L", word: "Loss", tone: "text-ink-muted" },
  draw: { letter: "D", word: "Draw", tone: "text-ink-muted" },
} as const;

const MODE = { ranked: "Ranked", async: "Recorded run", friend: "Friend" } as const;

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Gains in pencil with +N; losses in ink-muted with −N. Never color alone. */
function EloChange({ m }: { m: RecentMatch }) {
  if (m.mode === "friend") return <span className="text-ink-muted">unrated</span>;
  if (m.elo_after === null) return <span className="text-ink-muted">—</span>;
  const d = m.elo_after - m.elo_before;
  if (d > 0) return <span className="text-pencil">+{d}<span className="sr-only"> Elo</span></span>;
  if (d < 0) return <span className="text-ink-muted">−{-d}<span className="sr-only"> Elo</span></span>;
  return <span className="text-ink-muted">±0<span className="sr-only"> Elo</span></span>;
}

export default function RecentDuels({ matches }: { matches: RecentMatch[] }) {
  if (matches.length === 0) return <p className="mt-6 text-[17px] text-ink-muted">No duels yet.</p>;

  return (
    <ol className="mt-6 border-t border-hairline">
      {matches.map((m) => {
        const r = m.result ? RESULT[m.result] : null;
        return (
          <li
            key={m.match_id}
            className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0 border-b border-hairline py-4 sm:grid-cols-[2rem_minmax(0,1fr)_5rem_6rem]"
          >
            <span className={`text-[20px] font-extrabold max-sm:row-span-2 ${r?.tone ?? "text-ink-muted"}`}>
              <span aria-hidden="true">{r?.letter ?? "—"}</span>
              <span className="sr-only">{r?.word ?? "No result"}</span>
            </span>

            <div className="min-w-0 max-sm:row-span-2">
              {m.opponent ? (
                <Link
                  href={`/u/${encodeURIComponent(m.opponent)}`}
                  className="-my-2 inline-flex min-h-11 max-w-full items-center truncate py-2 text-[17px] font-semibold text-ink underline-offset-4 hover:underline"
                >
                  <span className="sr-only">against </span>@{m.opponent}
                </Link>
              ) : (
                <span className="text-[17px] text-ink-muted">No opponent</span>
              )}
              <p className="text-[13px] leading-5 text-ink-muted">
                {MODE[m.mode]} · <time dateTime={m.finished_at}>{day.format(new Date(m.finished_at))}</time>
              </p>
            </div>

            <span className="text-right text-[17px] tabular-nums lining-nums max-sm:col-start-3 max-sm:row-start-1">
              {m.opponent_score === null ? (
                <span className="text-ink-muted">—</span>
              ) : (
                <>
                  <span className="sr-only">Score </span>
                  {m.score}–{m.opponent_score}
                </>
              )}
            </span>

            <span className="text-right text-[15px] font-semibold tabular-nums lining-nums max-sm:col-start-3 max-sm:row-start-2">
              <EloChange m={m} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
