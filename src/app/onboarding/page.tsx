"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { usernameProblemFrom } from "@/lib/username";
import UsernameField, {
  errorClass,
  fieldClass,
  labelClass,
  noteClass,
  primaryButton,
  safeNext,
  useUsername,
} from "@/components/UsernameField";

export default function OnboardingPage() {
  const router = useRouter();
  const username = useUsername();
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createProfile(createClient(), username.value.trim(), birthDate);
      router.replace(safeNext());
    } catch (err) {
      const problem = usernameProblemFrom(err instanceof Error ? err.message : null);
      if (problem && problem !== "rate_limited") username.setProblem(problem);
      else setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center gap-8 px-4 py-12 font-ui text-ink">
      <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em]">Pick a username</h1>
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        <UsernameField state={username} autoFocus />
        <div className="flex flex-col gap-2">
          <label htmlFor="birth-date" className={labelClass}>
            Birth date
          </label>
          <input
            id="birth-date"
            type="date"
            className={fieldClass}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            aria-describedby="birth-date-note"
          />
          <p id="birth-date-note" className={noteClass}>
            Only used to check you&apos;re 13 or older. We don&apos;t save it.
          </p>
        </div>
        <button className={primaryButton} disabled={!username.locallyValid || birthDate === "" || busy}>
          {busy ? "Saving…" : "Start playing"}
        </button>
        {error && (
          <p className={errorClass} role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
