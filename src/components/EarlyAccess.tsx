"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";

export type RedeemError = "invalid" | "limited" | "error";

/** The header's "Enter code" fires this; the box with `anchorId` opens its code tab. */
export const ENTER_CODE_EVENT = "erudent:enter-code";
export const ENTER_CODE_ANCHOR = "enter-code";

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

const row = "mt-3 flex w-full gap-2";
const field =
  "h-[46px] min-w-0 flex-1 rounded-(--radius-md) border border-[#33333a] bg-surface/85 px-3.5 text-[15px] leading-normal text-text placeholder:text-[#8a867d] placeholder:opacity-100 hover:border-text-muted aria-invalid:border-accent-text";
const primary =
  "h-[46px] flex-none cursor-pointer rounded-(--radius-md) bg-text px-[18px] text-[15px] font-semibold text-bg hover:bg-text/90 disabled:cursor-wait disabled:opacity-60";
const toggle =
  "mt-1 inline-flex min-h-11 cursor-pointer items-center text-[14px] text-[#d6d2c9] underline underline-offset-4 hover:text-text";
const errorText = "mt-2 text-[14px] font-medium text-accent-text";
const done = "mt-3 text-[17px] leading-[26px]";

/** Early-access entry: join the waitlist, or bring an invitation code. */
export default function EarlyAccess({
  redeemError,
  needsCode = false,
  anchorId,
}: {
  redeemError: RedeemError | null;
  needsCode?: boolean;
  /** Set on one box per page: it gets this id and answers "Enter code". */
  anchorId?: string;
}) {
    const id = useId();
  const [tab, setTab] = useState<"wait" | "code">(redeemError || needsCode ? "code" : "wait");

  const [email, setEmail] = useState("");
  const [waitError, setWaitError] = useState<string | null>(null);
  const [waitBusy, setWaitBusy] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(redeemError ? REDEEM_ERRORS[redeemError] : null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  // "Enter code": switch to the code tab and focus the field (without a scroll jump;
  // the anchor link does the scrolling). Also on arrival at /#enter-code.
  useEffect(() => {
    if (!anchorId) return;
    const open = () => {
      setTab("code");
      requestAnimationFrame(() => codeInput.current?.focus({ preventScroll: true }));
    };
    if (window.location.hash === `#${anchorId}`) open();
    window.addEventListener(ENTER_CODE_EVENT, open);
    return () => window.removeEventListener(ENTER_CODE_EVENT, open);
  }, [anchorId]);

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

  // Switching modes moves focus to the new field so keyboard users land where they type.
  const emailInput = useRef<HTMLInputElement>(null);
  function switchTo(next: "wait" | "code") {
    setTab(next);
    requestAnimationFrame(() => (next === "code" ? codeInput : emailInput).current?.focus());
  }

  return (
    <div id={anchorId} className="mt-[34px] w-full max-w-[440px] scroll-mt-4">
      {needsCode && (
        <p className="mb-3 text-[15px] leading-[22px] font-medium text-text" role="status">
          You need an invite code to play. Enter it below or join the waitlist.
        </p>
      )}

      {tab === "wait" ? (
        joined ? (
          <p className={done} role="status">
            You&apos;re on the list. We&apos;ll send your code to {joined}. <span className="text-accent-text">∎</span>
          </p>
        ) : (
          <>
            <form className={row} onSubmit={joinWaitlist} noValidate>
              <label htmlFor={`${id}-email`} className="sr-only">
                Email address
              </label>
              <input
                id={`${id}-email`}
                ref={emailInput}
                className={field}
                type="email"
                autoComplete="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setWaitError(null);
                }}
                aria-invalid={waitError ? true : undefined}
                aria-describedby={waitError ? `${id}-err-wait` : undefined}
              />
              <button className={primary} type="submit" disabled={waitBusy}>
                Join waitlist
              </button>
            </form>
            {waitError && (
              <p id={`${id}-err-wait`} className={errorText} role="alert">
                {waitError}
              </p>
            )}
            <button type="button" className={toggle} onClick={() => switchTo("code")}>
              Have an invite code?
            </button>
          </>
        )
      ) : accepted ? (
        <p className={done} role="status">
          Code accepted. Your first duel is waiting. <span className="text-accent-text">∎</span>
        </p>
      ) : (
        <>
          <form className={row} onSubmit={enterCode} noValidate>
            <label htmlFor={`${id}-code`} className="sr-only">
              Invite code
            </label>
            <input
              id={`${id}-code`}
              ref={codeInput}
              className={`${field} font-mono tracking-[.12em] uppercase tabular-nums`}
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
              aria-describedby={codeError ? `${id}-err-code` : undefined}
            />
            <button className={primary} type="submit" disabled={codeBusy}>
              Enter
            </button>
          </form>
          {codeError && (
            <p id={`${id}-err-code`} className={errorText} role="alert">
              {codeError}
            </p>
          )}
          <button type="button" className={toggle} onClick={() => switchTo("wait")}>
            Join the waitlist instead
          </button>
        </>
      )}
    </div>
  );
}
