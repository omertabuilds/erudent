"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { usernameProblemFrom } from "@/lib/username";
import UsernameField, { errorClass, safeNext, useUsername } from "@/components/UsernameField";
import { Steps } from "@/components/AuthShell";
import { authField, authLabel, authNote, authPrimary, authTitle } from "@/components/ui";

export default function OnboardingForm() {
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

  // Progress: signed in (done to be here), a name that passes the checks, a birth date.
  const done = 1 + (username.locallyValid ? 1 : 0) + (birthDate ? 1 : 0);

  return (
    <div>
      <Steps total={3} done={done} label="Setup progress" />
      <p className={`${authLabel} mt-5`}>New player</p>
      <h1 className={`${authTitle} mt-3`}>Choose your name.</h1>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-6" noValidate>
        <UsernameField state={username} autoFocus step="01" />
        <NamePreview name={username.value.trim()} />
        <div className="flex flex-col">
          <label htmlFor="birth-date" className={authLabel}>
            <span className="mr-2 text-text">02</span>Birth date
          </label>
          <input
            id="birth-date"
            type="date"
            className={`${authField} mt-2 text-left tabular-nums scheme-dark`}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            aria-describedby="birth-date-note"
          />
          <p id="birth-date-note" className={`${authNote} mt-2`}>
            Only used to check you&apos;re 13 or older. We don&apos;t save it.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button className={authPrimary} disabled={!username.locallyValid || birthDate === "" || busy}>
            {busy ? "Saving…" : "Start"}
          </button>
          {error && (
            <p className={errorClass} role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

/** How others will see you: initial, name, unranked. Saves nothing. */
function NamePreview({ name }: { name: string }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 rounded-(--radius-md) border border-line bg-bg/50 px-3.5 py-3">
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-text text-[15px] leading-none font-bold text-bg">
        {(name || "?").charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className={`truncate text-[15px] leading-5 font-semibold tracking-[-0.02em] ${name ? "text-text" : "text-text-muted"}`}>
          {name || "yourname"}
        </p>
        <p className="font-mono text-[10px] leading-4 tracking-[0.14em] text-text-muted uppercase">Unranked · 10 placement duels</p>
      </div>
    </div>
  );
}
