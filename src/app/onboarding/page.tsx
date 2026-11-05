"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[a-z0-9_]{3,20}$/.test(username) && birthDate !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createProfile(createClient(), username, birthDate);
      const next = new URLSearchParams(window.location.search).get("next") ?? "/play";
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/play");
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <h1 className="font-serif text-4xl tracking-tight">Pick a username</h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            maxLength={20}
            autoFocus
            className="border border-line bg-background px-3 py-2 text-base outline-none focus:border-foreground"
            placeholder="e.g. euler_fan"
          />
          <span className="text-xs text-muted">3–20 characters. Letters, numbers, underscores.</span>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Birth date
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="border border-line bg-background px-3 py-2 text-base outline-none focus:border-foreground"
          />
          <span className="text-xs text-muted">Only used to check you&apos;re 13 or older. We don&apos;t save it.</span>
        </label>
        <button
          disabled={!valid || busy}
          className="border border-foreground bg-foreground px-4 py-3 text-background disabled:opacity-40"
        >
          {busy ? "Saving…" : "Start playing"}
        </button>
        {error && <p className="text-sm">{error}</p>}
      </form>
    </main>
  );
}
