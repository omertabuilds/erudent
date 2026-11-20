import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";
import { INVITE_COOKIE, redeemInvite } from "@/lib/invite";

/** Google sends players back here. Swap the code for a session, redeem any waiting invite, then route them on. */
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

  // An invite entered before signing in (see /redeem/[code]): bind it to the account now,
  // before onboarding, so nothing later asks for it again.
  const jar = await cookies();
  const invite = jar.get(INVITE_COOKIE)?.value;
  if (invite) {
    jar.delete(INVITE_COOKIE);
    const outcome = await redeemInvite(supabase, invite);
    if (outcome !== "redeemed") return NextResponse.redirect(`${origin}/?redeem=${outcome}`);
  }

  const profile = await api.myPlayer(supabase);
  if (!profile) return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
  if (profile.needs_rename) return NextResponse.redirect(`${origin}/onboarding/rename?next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${origin}${next}`);
}
