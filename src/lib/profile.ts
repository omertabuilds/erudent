import { TIER_NAMES, type RecentMatch } from "@/lib/erudent";

/** Placement: ranks show after this many rated duels (rank_name in the database). */
export const PLACEMENT = 10;

/** Lowest Elo of ranks II–VI, as public.tier_for_elo draws them. Rank I starts below 700. */
export const RANK_CUTOFFS = [700, 900, 1100, 1300, 1500] as const;

/** 1–6 from Elo, mirroring public.tier_for_elo. */
export function tierForElo(elo: number): number {
  return 1 + RANK_CUTOFFS.filter((c) => elo >= c).length;
}

/** 1–6 for a placed player, 0 during placement (rank hidden). Mirrors public.rank_name. */
export function tierOf(elo: number, matchesPlayed: number): number {
  return matchesPlayed < PLACEMENT ? 0 : tierForElo(elo);
}

/** 1–6 from the rank name get_profile returns; 0 for "Unranked". */
export function tierFromRankName(rank: string): number {
  return TIER_NAMES.indexOf(rank as (typeof TIER_NAMES)[number]) + 1;
}

/** The next rank up and the Elo it starts at, or null at the top. */
export function nextRank(elo: number): { tier: number; name: string; elo: number } | null {
  const t = tierForElo(elo);
  if (t >= 6) return null;
  return { tier: t + 1, name: TIER_NAMES[t], elo: RANK_CUTOFFS[t - 1] };
}

/** True when a duel changed Elo (ranked and recorded runs once scored; never friend games). */
export const isRated = (m: RecentMatch) => m.mode !== "friend" && m.elo_after !== null;

export type EloPoint = { elo: number; at: string };

/**
 * Elo before the oldest rated duel, then after each one, oldest first.
 * Built from the duels get_recent_matches returns (newest first). Fewer than two points → [].
 */
export function eloSeries(matches: RecentMatch[]): EloPoint[] {
  const rated = matches.filter(isRated).reverse();
  if (rated.length === 0) return [];
  return [
    { elo: rated[0].elo_before, at: rated[0].finished_at },
    ...rated.map((m) => ({ elo: m.elo_after as number, at: m.finished_at })),
  ];
}

/** "now", "5m", "3h", "2d", "6w", "4mo", "1y": compact, for a column. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

/** Long form for screen readers and tooltips: "3 hours ago". */
export function timeAgoLong(iso: string, now: number = Date.now()): string {
  const short = timeAgo(iso, now);
  if (short === "now") return "just now";
  const n = parseInt(short, 10);
  const unit = short.replace(/^\d+/, "");
  const word = { m: "minute", h: "hour", d: "day", w: "week", mo: "month", y: "year" }[unit] ?? unit;
  return `${n} ${word}${n === 1 ? "" : "s"} ago`;
}

/** Wins as a share of all decided-or-drawn duels, rounded. Null before the first duel. */
export function winRate(wins: number, losses: number, draws: number): number | null {
  const total = wins + losses + draws;
  return total === 0 ? null : Math.round((wins / total) * 100);
}

export type HeadToHead = { wins: number; losses: number; draws: number; lastAt: string; lastMatchId: string };

/**
 * The viewer's record against this player, from this player's recent duels (their side flipped).
 * Null when the two haven't met in those duels.
 */
export function headToHead(matches: RecentMatch[], viewer: string): HeadToHead | null {
  const met = matches.filter((m) => m.opponent !== null && m.opponent.toLowerCase() === viewer.toLowerCase());
  if (met.length === 0) return null;
  // matches are newest first.
  return {
    wins: met.filter((m) => m.result === "loss").length,
    losses: met.filter((m) => m.result === "win").length,
    draws: met.filter((m) => m.result === "draw").length,
    lastAt: met[0].finished_at,
    lastMatchId: met[0].match_id,
  };
}
