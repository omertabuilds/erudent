"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { usernameProblemFrom } from "@/lib/username";
import UsernameField, { errorClass, primaryButton, safeNext, useUsername } from "@/components/UsernameField";

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
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <UsernameField state={username} autoFocus />
      <button className={primaryButton} disabled={!username.locallyValid || busy}>
        {busy ? "Saving…" : "Save and continue"}
      </button>
      {error && (
        <p className={errorClass} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
