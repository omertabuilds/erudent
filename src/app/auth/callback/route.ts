import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";

/** Google sends players back here. Swap the code for a session, then route them on. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/play";
  // Only allow paths on this site, never another domain.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/play";

  if (!code) return NextResponse.redirect(`${origin}/login`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login`);

  const profile = await api.myPlayer(supabase);
  if (!profile) return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
  if (profile.needs_rename) return NextResponse.redirect(`${origin}/onboarding/rename?next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${origin}${next}`);
}
