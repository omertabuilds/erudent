import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Typed wrappers for every database function the app calls.
 * The browser never reads game tables directly: answers stay on the server.
 */

export type Slot = "A" | "B" | "C";

export type MatchQuestion = {
  slot: Slot;
  points: number;
  tier: number;
  topic: string;
  prompt: string;
  answer?: string; // only after the match ends
  solution?: string; // only after the match ends
};

export type MatchState = {
  id: string;
  mode: "ranked" | "friend" | "async";
  status: "waiting" | "active" | "finished";
  invite_code: string | null;
  server_now: string;
  started_at: string | null;
  ends_at: string | null;
  forfeited_by: string | null;
  me: {
    user_id: string;
    username: string;
    elo_before: number;
    elo_after: number | null;
    score: number;
    result: "win" | "loss" | "draw" | null;
    focus_strikes: number;
    rank: string;
    answers: { slot: Slot; answer: string | null; correct: boolean }[];
  };
  opponent: {
    username: string;
    is_ghost: boolean;
    elo_before: number;
    elo_after: number | null;
    score: number | null;
    result: "win" | "loss" | "draw" | null;
    solved: Slot[];
    rank: string;
  } | null;
  questions: MatchQuestion[];
};

export type SubmitResult = {
  status: "ok" | "invalid_format" | "already_answered" | "time_up" | "not_started" | "match_over";
  correct?: boolean;
};

export type FocusResult = { status: "warning" | "forfeited_question" | "flagged" | "ignored"; slot?: Slot };

export type LeaderboardRow = {
  place: number;
  username: string;
  elo: number;
  rank: string;
  wins: number;
  losses: number;
  draws: number;
};

async function call<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  createProfile: (sb: SupabaseClient, username: string, birthDate: string) =>
    call(sb, "create_profile", { p_username: username, p_birth_date: birthDate }),
  joinQueue: (sb: SupabaseClient) => call<string | null>(sb, "join_queue"),
  leaveQueue: (sb: SupabaseClient) => call<void>(sb, "leave_queue"),
  createFriendMatch: (sb: SupabaseClient) => call<{ match_id: string; code: string }>(sb, "create_friend_match"),
  joinFriendMatch: (sb: SupabaseClient, code: string) => call<string>(sb, "join_friend_match", { p_code: code }),
  getMatch: (sb: SupabaseClient, id: string) => call<MatchState>(sb, "get_match", { p_match: id }),
  submitAnswer: (sb: SupabaseClient, id: string, slot: Slot, answer: string) =>
    call<SubmitResult>(sb, "submit_answer", { p_match: id, p_slot: slot, p_answer: answer }),
  focusEvent: (sb: SupabaseClient, id: string, slot: Slot) =>
    call<FocusResult>(sb, "focus_event", { p_match: id, p_slot: slot }),
  heartbeat: (sb: SupabaseClient, id: string) => call<string>(sb, "heartbeat", { p_match: id }),
  claimForfeit: (sb: SupabaseClient, id: string) => call<{ status: string }>(sb, "claim_forfeit", { p_match: id }),
  finishMatch: (sb: SupabaseClient, id: string) => call<MatchState>(sb, "finish_match", { p_match: id }),
  myActiveMatch: (sb: SupabaseClient) => call<string | null>(sb, "my_active_match"),
  reportQuestion: (sb: SupabaseClient, id: string, slot: Slot, reason: string) =>
    call<void>(sb, "report_question", { p_match: id, p_slot: slot, p_reason: reason }),
  reportPlayer: (sb: SupabaseClient, id: string, reason: string) =>
    call<void>(sb, "report_player", { p_match: id, p_reason: reason }),
  /** For Axel's leaderboard page. Works signed out. */
  leaderboard: (sb: SupabaseClient, limit = 100) => call<LeaderboardRow[]>(sb, "get_leaderboard", { p_limit: limit }),
  /** For Axel's profile page. Works signed out. */
  recentMatches: (sb: SupabaseClient, username: string) =>
    call<unknown[]>(sb, "get_recent_matches", { p_username: username }),
};

/** Turns database error codes into words a player understands. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const known: Record<string, string> = {
    too_young: "You need to be 13 or older to play.",
    username_taken: "That username is taken.",
    invalid_username: "Usernames are 3–20 characters: letters, numbers, underscores.",
    profile_exists: "You already have a profile.",
    invalid_code: "That code doesn't match a waiting game.",
    match_full: "That game already has two players.",
    no_questions_for_tier: "Not enough questions loaded yet. Try again soon.",
    no_profile: "Finish setting up your profile first.",
    not_participant: "You're not in this match.",
    not_signed_in: "Sign in first.",
  };
  for (const [code, text] of Object.entries(known)) if (msg.includes(code)) return text;
  return "Something went wrong. Try again.";
}
