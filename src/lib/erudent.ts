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

/** Public profile style get_match adds to each player, for the duel screen's player cards. */
export type MatchCard = Pick<ProfileStyle, "banner" | "accent"> & {
  avatar_path: string | null;
  wins: number;
  losses: number;
  draws: number;
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
  } & MatchCard;
  opponent: ({
    username: string;
    is_ghost: boolean;
    elo_before: number;
    elo_after: number | null;
    score: number | null;
    result: "win" | "loss" | "draw" | null;
    solved: Slot[];
    rank: string;
  } & MatchCard) | null;
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

/** Banner art presets (profiles.banner). */
export const BANNERS = ["grid", "mountain", "construction", "solid"] as const;
export type Banner = (typeof BANNERS)[number];

/** Banner, accent (0 = rank hue, 1–6 = a rank hue) and tagline, as update_profile_style saves them. */
export type ProfileStyle = { banner: Banner; accent: number; tagline: string | null };

/** The signed-in player. needs_rename is private: only they can see it. */
export type MyPlayer = ProfileStyle & {
  id: string;
  username: string;
  elo: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  needs_rename: boolean;
  /** Storage path in the "avatars" bucket, or null for the initial-letter avatar. */
  avatar_path: string | null;
  /** Public URL built from avatar_path. */
  avatar_url: string | null;
};

/** Public URL of a file in the avatars bucket. */
export const avatarUrl = (sb: SupabaseClient, path: string | null) =>
  path ? sb.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;

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

/** Question tiers 1–6, named like the ranks (rank_name in the database). */
export const TIER_NAMES = ["Novice", "Apprentice", "Scholar", "Savant", "Sage", "Erudite"] as const;
export const tierName = (tier: number) => TIER_NAMES[tier - 1] ?? `Tier ${tier}`;

/** A practice question. Never has the answer: that comes back only after you answer or skip. */
export type PracticeQuestion = {
  question_id: string;
  tier: number;
  topic: string;
  prompt: string;
  auto: boolean; // auto tier on?
  selected_tier: number; // tier the next question comes from (can differ from `tier` right after a switch)
};

export type PracticeResult =
  | { status: "invalid_format" } // not an integer or fraction: the question isn't used up
  | { status: "no_question" }
  | { status: "ok"; correct: boolean; answer: string; solution: string; streak: number; tier: number };

export type PracticeStats = {
  attempted: number; // skips count as attempted
  correct: number;
  streak: number;
  best_streak: number;
  auto: boolean;
  tier: number | null; // null until you've practiced once
  by_tier: { tier: number; attempted: number; correct: number }[];
};

async function call<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  /** Signed in. True once you've redeemed an invitation code. */
  hasAccess: (sb: SupabaseClient) => call<boolean>(sb, "has_access"),
  /** Signed in. Null if you haven't made a profile yet. */
  myPlayer: async (sb: SupabaseClient): Promise<MyPlayer | null> => {
    const p = (await call<Omit<MyPlayer, "avatar_url">[]>(sb, "my_player"))[0];
    return p ? { ...p, avatar_url: avatarUrl(sb, p.avatar_path) } : null;
  },
  /** Signed in. Saves banner, accent and tagline together. Trims the tagline; empty → null. */
  updateProfileStyle: (sb: SupabaseClient, style: ProfileStyle) =>
    call<ProfileStyle>(sb, "update_profile_style", { p_banner: style.banner, p_accent: style.accent, p_tagline: style.tagline }),
  /** Signed in. A file you've uploaded to avatars/<your id>/, or null to go back to the initial. */
  setAvatar: (sb: SupabaseClient, path: string | null) => call<string | null>(sb, "set_avatar", { p_path: path }),
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
  /** Top players past placement. tier 1–6 filters; place stays global. Works signed out. */
  leaderboard: (sb: SupabaseClient, limit = 100, tier: number | null = null) =>
    call<LeaderboardRow[]>(sb, "get_leaderboard", { p_limit: limit, p_tier: tier }),
  /** Global place, or null while still in placement. Any case. Works signed out. */
  playerPlace: (sb: SupabaseClient, username: string) => call<number | null>(sb, "get_player_place", { p_username: username }),
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

  // Practice: solo, unrated, no timer.
  /** Signed in. Tier 1–6 stays on that tier; null = auto. Same question until it's answered or skipped. */
  nextPracticeQuestion: (sb: SupabaseClient, tier: number | null) =>
    call<PracticeQuestion>(sb, "next_practice_question", { p_tier: tier }),
  /** Signed in. Wrong format doesn't use up the question. */
  submitPracticeAnswer: (sb: SupabaseClient, answer: string) =>
    call<PracticeResult>(sb, "submit_practice_answer", { p_answer: answer }),
  /** Signed in. Counts as wrong and shows the answer. */
  skipPracticeQuestion: (sb: SupabaseClient) => call<PracticeResult>(sb, "skip_practice_question"),
  /** Signed in. All-time numbers plus the saved tier setting. */
  practiceStats: (sb: SupabaseClient) => call<PracticeStats>(sb, "practice_stats"),
  /** Signed in. Only questions you've answered or skipped in practice. */
  reportPracticeQuestion: (sb: SupabaseClient, questionId: string, reason: string) =>
    call<void>(sb, "report_practice_question", { p_question: questionId, p_reason: reason }),

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
    no_access: "You need an invite code to play.",
    rename_not_needed: "Your username is fine as it is.",
    profile_exists: "You already have a profile.",
    invalid_code: "That code doesn't match a waiting game.",
    match_full: "That game already has two players.",
    no_questions_for_tier: "Not enough questions loaded yet. Try again soon.",
    // After no_questions_for_tier: "no_question" is part of that code, and the first match wins.
    no_question: "There's no question to answer. Load the next one.",
    in_match: "Finish your match first.",
    not_attempted: "You can only report questions you've answered.",
    invalid_tier: "Pick a tier from 1 to 6.",
    no_profile: "Finish setting up your profile first.",
    not_participant: "You're not in this match.",
    not_signed_in: "Sign in first.",
    invalid_email: "Enter a valid email address.",
    rate_limited: "Too many tries. Wait a few minutes and try again.",
    tagline_not_allowed: "That tagline has a word we don't allow. Try another.",
    tagline_length: "Keep the tagline to 60 characters.",
    invalid_banner: "Pick one of the four banners.",
    invalid_accent: "Pick one of the accents.",
    // Profile pictures. avatar_* codes come from the browser (lib/avatar.ts) or set_avatar;
    // the rest are Storage's own messages.
    avatar_too_big: "That picture is over 2 MB. Pick a smaller one.",
    "exceeded the maximum allowed size": "That picture is over 2 MB. Pick a smaller one.",
    avatar_wrong_type: "Use a JPEG, PNG or WebP picture.",
    "mime type": "Use a JPEG, PNG or WebP picture.",
    avatar_unreadable: "Couldn't read that picture. Try another.",
    avatar_path_invalid: "Couldn't save that picture. Try again.",
    avatar_missing: "Couldn't save that picture. Try again.",
    avatar_upload_failed: "Couldn't upload that picture. Try again.",
  };
  for (const [code, text] of Object.entries(known)) if (msg.includes(code)) return text;
  return "Something went wrong. Try again.";
}
