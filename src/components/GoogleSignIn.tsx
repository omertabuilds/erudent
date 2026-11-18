"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authError, authPrimary } from "@/components/ui";

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
    <div className="flex flex-col gap-3">
      <button onClick={signIn} disabled={busy} className={`${authPrimary} disabled:cursor-wait`}>
        <span aria-hidden="true" className="text-[16px] leading-none font-bold">
          G
        </span>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className={authError}>
          {error}
        </p>
      )}
    </div>
  );
}
