"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/erudent";
import {
  USERNAME_HINT,
  USERNAME_MESSAGES,
  localUsernameProblem,
  type UsernameProblem,
} from "@/lib/username";

export const fieldClass =
  "h-[60px] w-full min-w-0 rounded-none border border-rule bg-sunken px-[18px] font-ui text-[18px] leading-normal text-ink placeholder:text-ink-muted placeholder:opacity-100 aria-invalid:border-pencil";
export const primaryButton =
  "h-[60px] cursor-pointer rounded-none bg-ink px-7 font-ui text-[17px] leading-normal font-bold text-on-ink shadow-[inset_0_-4px_0_var(--rule)] active:translate-y-[3px] active:shadow-[inset_0_-1px_0_var(--rule)] disabled:cursor-not-allowed disabled:opacity-50";
export const labelClass = "font-ui text-[15px] font-semibold text-ink";
export const noteClass = "text-[13px] leading-5 text-ink-muted";
export const errorClass = "text-[14px] font-semibold text-pencil";

/**
 * Username state for a form. Rules the browser knows are checked as you type; the
 * wordlist and "taken" are asked of the database after a short pause.
 * `setProblem` lets the form show what the database said on submit.
 */
export function useUsername() {
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<UsernameProblem | null>(null);
  const [checking, setChecking] = useState(false);
  const [okFor, setOkFor] = useState<string | null>(null);

  useEffect(() => {
    const v = value.trim();
    setProblem(null);
    setOkFor(null);
    setChecking(false);
    if (!v) return;
    let stale = false;
    const t = setTimeout(async () => {
      const local = localUsernameProblem(v);
      if (local) return setProblem(local);
      setChecking(true);
      try {
        const p = await api.checkUsername(createClient(), v);
        if (stale) return;
        setProblem(p);
        if (!p) setOkFor(v);
      } catch {
        // Submitting checks again and shows the reason.
      } finally {
        if (!stale) setChecking(false);
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [value]);

  return {
    value,
    setValue,
    problem,
    setProblem,
    checking,
    available: okFor !== null && okFor === value.trim(),
    /** Passes the rules the browser can check. The database has the last word on submit. */
    locallyValid: value.trim() !== "" && localUsernameProblem(value) === null && problem === null,
  };
}

export default function UsernameField({ state, autoFocus }: { state: ReturnType<typeof useUsername>; autoFocus?: boolean }) {
  const { value, setValue, problem, checking, available } = state;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="username" className={labelClass}>
        Username
      </label>
      <input
        id="username"
        className={fieldClass}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={20}
        autoFocus={autoFocus}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="e.g. Euler.fan"
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? "username-error username-hint" : "username-hint username-status"}
      />
      {problem ? (
        <p id="username-error" className={errorClass} role="alert">
          {USERNAME_MESSAGES[problem]}
        </p>
      ) : (
        <p id="username-status" className="min-h-5 text-[14px] text-ink-muted" role="status">
          {checking ? "Checking…" : available ? <><span className="text-pencil">✓</span> Available</> : null}
        </p>
      )}
      <p id="username-hint" className={noteClass}>
        {USERNAME_HINT}
      </p>
    </div>
  );
}

/** `?next=` if it's a path on this site, else /play. */
export function safeNext() {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/play";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/play";
}
