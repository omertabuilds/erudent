"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { primary } from "@/components/ui";

/** The sign-in button. Google sends the player to /auth/callback, which forwards to `?next=` (default /play). */
export default function GoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const next = new URLSearchParams(window.location.search).get("next") ?? "/play";
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError("Couldn't reach Google. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={signIn} disabled={busy} className={`${primary} w-full cursor-pointer gap-3 disabled:cursor-default sm:w-auto sm:min-w-[280px]`}>
        <span aria-hidden="true" className="text-[17px] leading-none font-extrabold">
          G
        </span>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="text-[15px] leading-[22px]">
          {error}
        </p>
      )}
    </div>
  );
}
