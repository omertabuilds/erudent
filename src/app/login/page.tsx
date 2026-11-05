"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <h1 className="font-serif text-5xl tracking-tight">erudent</h1>
      <p className="text-muted">Sign in to play ranked math duels.</p>
      <button
        onClick={signIn}
        disabled={busy}
        className="border border-foreground bg-foreground px-4 py-3 text-background disabled:opacity-50"
      >
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="text-sm">{error}</p>}
      <p className="text-xs text-muted">You must be 13 or older to play.</p>
    </main>
  );
}
