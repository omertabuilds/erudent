import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user!.id).maybeSingle();
  if (!profile) return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${origin}${next}`);
}
