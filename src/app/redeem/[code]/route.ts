import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";

/**
 * Invitation codes: /redeem/ABCDEFGH → sign in if needed → tie the code to this
 * account → into the app. The landing page checks the code before sending people here.
 * Failures go back to the landing page, which shows the error under the code field.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { origin } = new URL(request.url);
  const here = `/redeem/${encodeURIComponent(code)}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(here)}`);

  // Don't use ?code= here: middleware treats that as a Supabase sign-in code.
  let redeemed: boolean;
  try {
    redeemed = await api.redeemAccessCode(supabase, code);
  } catch (err) {
    const limited = err instanceof Error && err.message.includes("rate_limited");
    return NextResponse.redirect(`${origin}/?redeem=${limited ? "limited" : "error"}`);
  }
  if (!redeemed) return NextResponse.redirect(`${origin}/?redeem=invalid`);

  // /play sends players without a profile to onboarding first.
  return NextResponse.redirect(`${origin}/play`);
}
