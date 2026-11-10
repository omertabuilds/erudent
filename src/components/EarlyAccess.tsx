"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";

export type RedeemError = "invalid" | "limited" | "error";

const BAD_CODE = "That code isn't valid or has been used.";
const REDEEM_ERRORS: Record<RedeemError, string> = {
  invalid: BAD_CODE,
  limited: "Too many tries. Wait a few minutes and try again.",
  error: "Something went wrong. Try again.",
};

// Codes are XXXX-XXXX, same alphabet as the database: no 0/O/1/I/L.
const normalizeCode = (v: string) => v.toUpperCase().replace(/[\s-]/g, "");
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/** Input mask: uppercase, letters and digits only, dash after the 4th character. */
function maskCode(v: string) {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

const field =
  "h-[60px] min-w-0 flex-[1_1_240px] rounded-(--r-md) border border-rule bg-sunken px-[18px] font-ui leading-normal text-ink placeholder:text-ink-muted placeholder:opacity-100";
const primary =
  "h-[60px] flex-none cursor-pointer rounded-(--r-md) bg-ink max-sm:flex-auto px-7 font-ui text-[17px] leading-normal font-bold text-on-ink shadow-[inset_0_-4px_0_var(--rule)] active:translate-y-[3px] active:shadow-[inset_0_-1px_0_var(--rule)] disabled:cursor-wait";
const tabButton =
  "min-h-11 flex-1 basis-0 cursor-pointer rounded-(--r-sm) bg-transparent px-4 font-ui text-[15px] leading-none font-semibold text-ink aria-pressed:bg-ink aria-pressed:text-on-ink";
const note = "mt-3 text-[13px] leading-5 text-ink-muted";
const errorText = "mt-[10px] text-[14px] font-semibold text-pencil";
const done = "mt-5 text-[19px] leading-[29px]";

/** Early-access entry: join the waitlist, or bring an invitation code. */
export default function EarlyAccess({ redeemError, needsCode = false }: { redeemError: RedeemError | null; needsCode?: boolean }) {
  const [tab, setTab] = useState<"wait" | "code">(redeemError || needsCode ? "code" : "wait");

  const [email, setEmail] = useState("");
  const [waitError, setWaitError] = useState<string | null>(null);
  const [waitBusy, setWaitBusy] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(redeemError ? REDEEM_ERRORS[redeemError] : null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(v)) return setWaitError("Enter a valid email address.");
    setWaitBusy(true);
    try {
      await api.joinWaitlist(createClient(), v);
      setJoined(v);
    } catch (err) {
      setWaitError(friendlyError(err));
    } finally {
      setWaitBusy(false);
    }
  }

  async function enterCode(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!c) return setCodeError("Enter your invitation code.");
    if (!CODE_RE.test(c)) return setCodeError(BAD_CODE);
    setCodeBusy(true);
    try {
      if (!(await api.checkAccessCode(createClient(), c))) {
        setCodeError(BAD_CODE);
        setCodeBusy(false);
        return;
      }
      setAccepted(true);
      // Signs in if needed, ties the code to the account, then into the app.
      window.location.assign(`/redeem/${c}`);
    } catch (err) {
      setCodeError(friendlyError(err));
      setCodeBusy(false);
    }
  }

  return (
    <div className="mt-10 w-full max-w-[520px] text-left">
      {needsCode && (
        <p className="mb-4 text-[17px] leading-[26px] font-semibold text-ink" role="status">
          You need an invite code to play. Enter it below or join the waitlist.
        </p>
      )}
      <div className="flex gap-1 rounded-(--r-md) border border-rule p-1" role="group" aria-label="Choose how to get in">
        <button type="button" className={tabButton} aria-pressed={tab === "wait"} onClick={() => setTab("wait")}>
          Join the waitlist
        </button>
        <button
          type="button"
          className={tabButton}
          aria-pressed={tab === "code"}
          onClick={() => setTab("code")}
        >
          I have a code
        </button>
      </div>

      {tab === "wait" ? (
        <section>
          {joined ? (
            <p className={done} role="status">
              You&apos;re on the list. We&apos;ll send your code to {joined}. <span className="text-pencil">∎</span>
            </p>
          ) : (
            <>
              <form className="mt-4 flex flex-wrap gap-[10px]" onSubmit={joinWaitlist} noValidate>
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <input
                  id="email"
                  className={`${field} text-[18px] font-normal`}
                  type="email"
                  autoComplete="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setWaitError(null);
                  }}
                  aria-invalid={waitError ? true : undefined}
                  aria-describedby={waitError ? "err-wait note-wait" : "note-wait"}
                />
                <button className={primary} type="submit" disabled={waitBusy}>
                  Get a code
                </button>
              </form>
              {waitError && (
                <p id="err-wait" className={errorText} role="alert">
                  {waitError}
                </p>
              )}
              <p id="note-wait" className={note}>
                One email when your code is ready. Nothing else.
              </p>
            </>
          )}
        </section>
      ) : (
        <section>
          {accepted ? (
            <p className={done} role="status">
              Code accepted. Your first duel is waiting. <span className="text-pencil">∎</span>
            </p>
          ) : (
            <>
              <form className="mt-4 flex flex-wrap gap-[10px]" onSubmit={enterCode} noValidate>
                <label htmlFor="code" className="sr-only">
                  Invitation code
                </label>
                <input
                  id="code"
                  className={`${field} text-[20px] font-semibold tracking-[.12em] uppercase tabular-nums`}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={9}
                  placeholder="XXXX-XXXX"
                  value={code}
                  onChange={(e) => {
                    setCode(maskCode(e.target.value));
                    setCodeError(null);
                  }}
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? "err-code note-code" : "note-code"}
                />
                <button className={primary} type="submit" disabled={codeBusy}>
                  Enter
                </button>
              </form>
              {codeError && (
                <p id="err-code" className={errorText} role="alert">
                  {codeError}
                </p>
              )}
              <p id="note-code" className={note}>
                Codes are single-use and tied to one account.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
