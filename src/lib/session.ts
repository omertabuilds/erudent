import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** For server pages that need a signed-in player with a profile. */
export async function requirePlayer(next: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, elo, matches_played, wins, losses, draws")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return { supabase, profile };
}
