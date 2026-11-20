import type { SupabaseClient } from "@supabase/supabase-js";
import { api } from "@/lib/erudent";

/**
 * An invitation code someone entered before signing in. /redeem/[code] keeps it here while they
 * go through Google, and /auth/callback redeems it as soon as the account exists, before
 * onboarding. The code used to ride along only in ?next=, and Supabase drops that whenever the
 * redirect URL isn't on its allow-list (it falls back to the Site URL), so new players finished
 * onboarding without a code and were asked for it again.
 */
export const INVITE_COOKIE = "erudent_invite";

/**
 * httpOnly (scripts can't read it), Secure (HTTPS only; browsers also allow it on http://localhost),
 * gone after an hour. SameSite=Lax, not Strict: the player comes back from Google on a cross-site
 * redirect, and a Strict cookie wouldn't be sent with that request, so the callback couldn't redeem it.
 */
export const INVITE_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 } as const;

export type RedeemOutcome = "redeemed" | "invalid" | "limited" | "error";

/** Ties `code` to the signed-in account. Never throws. */
export async function redeemInvite(sb: SupabaseClient, code: string): Promise<RedeemOutcome> {
  try {
    return (await api.redeemAccessCode(sb, code)) ? "redeemed" : "invalid";
  } catch (err) {
    return err instanceof Error && err.message.includes("rate_limited") ? "limited" : "error";
  }
}
