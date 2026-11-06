import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";

/**
 * For server pages that need a signed-in player with a profile.
 * Players whose username breaks the rules pick a new one first.
 */
export async function requirePlayer(next: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const profile = await api.myPlayer(supabase);
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  if (profile.needs_rename) redirect(`/onboarding/rename?next=${encodeURIComponent(next)}`);
  return { supabase, profile };
}
