"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { usernameProblemFrom } from "@/lib/username";
import UsernameField, { errorClass, safeNext, useUsername } from "@/components/UsernameField";
import { kicker, primary, title } from "@/components/ui";

export default function RenameForm() {
  const router = useRouter();
  const username = useUsername();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.renameUsername(createClient(), username.value.trim());
      router.replace(safeNext());
      router.refresh();
    } catch (err) {
      const problem = usernameProblemFrom(err instanceof Error ? err.message : null);
      if (problem && problem !== "rate_limited") username.setProblem(problem);
      else setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <UsernameField state={username} autoFocus />
      <div className="flex flex-col gap-4">
        <button
          className={`${primary} w-full cursor-pointer disabled:cursor-not-allowed sm:w-auto sm:min-w-[200px] sm:self-start`}
          disabled={!username.locallyValid || busy}
        >
          {busy ? "Saving…" : "Save name"}
        </button>
        {error && (
          <p className={errorClass} role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

/** The /onboarding/rename page body; the page does the redirects. */
export function RenameView({ username }: { username: string }) {
  return (
    <>
      <div className="max-w-[640px]">
        <p className={kicker}>New username</p>
        <h1 className={`${title} mt-5`}>Choose a new name.</h1>
      </div>
      <div className="max-w-[480px]">
        <p className="mt-6 text-ink-muted">
          <span className="font-semibold break-all text-ink">@{username}</span> doesn&apos;t fit our naming rules. Your Elo and
          match history stay with you.
        </p>
        <div className="mt-10">
          <RenameForm />
        </div>
      </div>
    </>
  );
}
