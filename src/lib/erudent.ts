import type { SupabaseClient } from "@supabase/supabase-js";
import { USERNAME_MESSAGES, type UsernameProblem } from "@/lib/username";

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

/** The signed-in player. needs_rename is private: only they can see it. */
export type MyPlayer = {
  id: string;
  username: string;
  elo: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  needs_rename: boolean;
};

export type ProfileSummary = {
  username: string;
  elo: number;
  rank: string;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
};

export type RecentMatch = {
  match_id: string;
  mode: "ranked" | "friend" | "async";
  finished_at: string;
  result: "win" | "loss" | "draw" | null;
  elo_before: number;
  elo_after: number | null;
  opponent: string | null;
  score: number;
  opponent_score: number | null;
};

async function call<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  /** Signed in. Null if you haven't made a profile yet. */
  myPlayer: async (sb: SupabaseClient) => (await call<MyPlayer[]>(sb, "my_player"))[0] ?? null,
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
  /** For /u/[username]. Any case. Null if there's no such player. Works signed out. */
  profile: async (sb: SupabaseClient, username: string) =>
    (await call<ProfileSummary[]>(sb, "get_profile", { p_username: username }))[0] ?? null,
  /** Last 10 finished duels, newest first. Works signed out. */
  recentMatches: (sb: SupabaseClient, username: string) =>
    call<RecentMatch[]>(sb, "get_recent_matches", { p_username: username }),
  /** Signed in. Null if the name is allowed and free (your own counts as free), else why not. */
  checkUsername: (sb: SupabaseClient, username: string) =>
    call<UsernameProblem | null>(sb, "check_username", { p_username: username }),
  /** Signed in, and only when your name was flagged (myPlayer().needs_rename). */
  renameUsername: (sb: SupabaseClient, username: string) => call(sb, "rename_username", { p_username: username }),

  // Early access. join_waitlist and check_access_code rate-limit by IP, so call them
  // from the browser client, never from server code (every visitor would share one IP).
  /** Works signed out. Already on the list is a quiet success. */
  joinWaitlist: (sb: SupabaseClient, email: string) => call<void>(sb, "join_waitlist", { p_email: email }),
  /** Works signed out. True if the code is real and unused. Doesn't use it up. */
  checkAccessCode: (sb: SupabaseClient, code: string) => call<boolean>(sb, "check_access_code", { p_code: code }),
  /** Signed in. Ties the code to this account. False if the code is bad or used. */
  redeemAccessCode: (sb: SupabaseClient, code: string) => call<boolean>(sb, "redeem_access_code", { p_code: code }),
};

/** Turns database error codes into words a player understands. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const known: Record<string, string> = {
    too_young: "You need to be 13 or older to play.",
    ...USERNAME_MESSAGES,
    needs_rename: "Pick a new username first.",
    rename_not_needed: "Your username is fine as it is.",
    profile_exists: "You already have a profile.",
    invalid_code: "That code doesn't match a waiting game.",
    match_full: "That game already has two players.",
    no_questions_for_tier: "Not enough questions loaded yet. Try again soon.",
    no_profile: "Finish setting up your profile first.",
    not_participant: "You're not in this match.",
    not_signed_in: "Sign in first.",
    invalid_email: "Enter a valid email address.",
    rate_limited: "Too many tries. Wait a few minutes and try again.",
  };
  for (const [code, text] of Object.entries(known)) if (msg.includes(code)) return text;
  return "Something went wrong. Try again.";
}
