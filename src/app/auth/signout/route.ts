import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs the player out and goes back to the landing page.
 * POST only (a form in the header), so a link or prefetch can't sign anyone out.
 * Cross-site posts are refused: the request must come from this origin.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return new NextResponse(null, { status: 403 });

  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", url), { status: 303 });
}
