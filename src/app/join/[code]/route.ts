import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Friend invite links: /join/ABC123 → sign in if needed → straight into the match. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { origin } = new URL(request.url);
  const here = `/join/${encodeURIComponent(code)}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(here)}`);

  const { data: matchId, error } = await supabase.rpc("join_friend_match", { p_code: code });
  if (error?.message.includes("no_profile")) {
    return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(here)}`);
  }
  if (error?.message.includes("needs_rename")) {
    return NextResponse.redirect(`${origin}/onboarding/rename?next=${encodeURIComponent(here)}`);
  }
  if (error || !matchId) return NextResponse.redirect(`${origin}/play?join_error=1`);
  return NextResponse.redirect(`${origin}/match/${matchId}`);
}
