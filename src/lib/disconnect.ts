import type { MatchState } from "@/lib/erudent";

/** Silence before the duel screen says the opponent disconnected. */
export const DISCONNECT_AFTER_MS = 5_000;
/** Silence before claim_forfeit ends the duel (server: interval '30 seconds'). */
export const FORFEIT_AFTER_MS = 30_000;

/**
 * Time left before the opponent forfeits, or null when they count as connected.
 * Driven by the server's last-seen stamp and the server clock (`serverNow`), so it survives a reload.
 * Only for a live duel against a real opponent: never before they join, during the countdown,
 * after the end, or in a recorded run.
 */
export function disconnectLeft(match: MatchState, live: boolean, serverNow: number): number | null {
  const opp = match.opponent;
  if (!live || match.status !== "active" || match.mode === "async" || !opp || opp.is_ghost || !opp.last_seen) return null;
  const silent = serverNow - Date.parse(opp.last_seen);
  if (!(silent > DISCONNECT_AFTER_MS)) return null;
  return Math.max(0, FORFEIT_AFTER_MS - silent);
}
