import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE, INVITE_COOKIE_OPTIONS, redeemInvite } from "@/lib/invite";

/**
 * Invitation codes: /redeem/ABCDEFGH → sign in if needed → tie the code to this
 * account → into the app. The landing page checks the code before sending people here.
 * Failures go back to the landing page, which shows the error under the code field.
 *
 * Signed out: the code waits in a cookie and /auth/callback redeems it the moment the
 * account exists, so it can't get lost on the way through Google or onboarding.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { origin } = new URL(request.url);
  const jar = await cookies();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    jar.set(INVITE_COOKIE, code.slice(0, 16), INVITE_COOKIE_OPTIONS);
    return NextResponse.redirect(`${origin}/login?next=/play`);
  }

  jar.delete(INVITE_COOKIE);
  // Don't use ?code= here: middleware treats that as a Supabase sign-in code.
  const outcome = await redeemInvite(supabase, code);
  if (outcome !== "redeemed") return NextResponse.redirect(`${origin}/?redeem=${outcome}`);

  // /play sends players without a profile to onboarding first.
  return NextResponse.redirect(`${origin}/play`);
}
