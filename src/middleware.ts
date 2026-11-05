import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // If Supabase sends a sign-in code to a page other than /auth/callback
  // (it falls back to the Site URL when a redirect isn't allow-listed),
  // pass it on to the callback so sign-in still finishes.
  const { pathname, searchParams } = request.nextUrl;
  if (searchParams.has("code") && pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    if (!url.searchParams.has("next")) url.searchParams.set("next", "/play");
    return NextResponse.redirect(url);
  }
  return updateSession(request);
}

export const config = {
  // Skip static files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
