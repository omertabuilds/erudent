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
import { caption, field, label } from "@/components/ui";

/** A form-level error under the submit button. */
export const errorClass = "text-[15px] leading-[22px] text-ink";

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

const MAX = 20;

/**
 * Label and a live count, the field, then one status line:
 * "✓ Available" in pencil, or what's wrong in ink-muted, then the naming rules.
 */
export default function UsernameField({ state, autoFocus }: { state: ReturnType<typeof useUsername>; autoFocus?: boolean }) {
  const { value, setValue, problem, checking, available } = state;
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor="username" className={label}>
          Username
        </label>
        <span className={`${caption} tabular-nums`} aria-hidden="true">
          {[...value].length}/{MAX}
        </span>
      </div>
      <input
        id="username"
        className={`${field} mt-2`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX}
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
        <p id="username-error" className={`${caption} mt-2 min-h-[18px] font-semibold`} role="alert">
          <span aria-hidden="true">✗ </span>
          {USERNAME_MESSAGES[problem]}
        </p>
      ) : (
        <p id="username-status" className={`${caption} mt-2 min-h-[18px] font-semibold`} role="status">
          {checking ? "Checking…" : available ? <span className="text-pencil">✓ Available</span> : null}
        </p>
      )}
      <p id="username-hint" className={`${caption} mt-1`}>
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
