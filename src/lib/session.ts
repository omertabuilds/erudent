import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";

/**
 * For server pages that need a signed-in player with a profile.
 * Early access: no redeemed invitation code → back to the landing page to enter one.
 * Players whose username breaks the rules pick a new one first.
 */
export async function requirePlayer(next: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const [access, profile] = await Promise.all([api.hasAccess(supabase), api.myPlayer(supabase)]);
  if (!access) redirect("/?access=required"); // landing page opens on "I have a code"
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  if (profile.needs_rename) redirect(`/onboarding/rename?next=${encodeURIComponent(next)}`);
  return { supabase, profile };
}
