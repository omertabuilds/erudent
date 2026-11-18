"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { useFriendGame } from "@/lib/useFriendGame";
import QueueWarmup from "@/components/QueueWarmup";

const POLL_MS = 2000;
/** How long "Opponent found" shows before the match opens. Matches start 5 s after they're made. */
const FOUND_HOLD_MS = 3000;

const card = "min-w-0 rounded-(--radius-lg) border border-line bg-surface";
const primary =
  "inline-flex h-11 flex-none cursor-pointer items-center rounded-(--radius-md) bg-text px-[26px] text-[15px] font-semibold text-bg hover:bg-text/90 disabled:cursor-default disabled:opacity-40";
const outline =
  "inline-flex h-11 flex-none cursor-pointer items-center rounded-(--radius-md) border border-[#2c2c33] px-[18px] text-[15px] font-medium text-text hover:border-text-muted disabled:cursor-default disabled:opacity-40";
const quiet = "inline-flex min-h-11 cursor-pointer items-center text-[14px] text-text-muted hover:text-text disabled:cursor-default disabled:opacity-40";
const segment =
  "h-[30px] cursor-pointer rounded-[6px] px-3.5 text-[13px] font-medium text-text-muted aria-pressed:bg-text aria-pressed:text-bg disabled:cursor-default";
const mono = "font-mono text-[12px] tracking-[0.04em] text-text-muted uppercase";

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/**
 * The play card. Ranked: Find match runs the ranked queue (searching, then "Match found").
 * Unranked: friend games, the only unrated duel there is: create a code or join one.
 */
export default function Lobby() {
  const router = useRouter();
  const sb = useRef(createClient()).current;
  const [searching, setSearching] = useState(false);
  const [waitedSec, setWaitedSec] = useState(0);
  /** The ranked match the queue returned, held for FOUND_HOLD_MS before opening it. */
  const [found, setFound] = useState<string | null>(null);
  const [foundLeft, setFoundLeft] = useState(0);
  const { friendCode, createFriend, copy, copied, inviteLink, error, setError } = useFriendGame(sb);
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"ranked" | "unranked">("ranked");
  const queuedAt = useRef(0);

  // If you closed the tab mid-match, send you back in.
  useEffect(() => {
    api.myActiveMatch(sb).then((id) => id && router.replace(`/match/${id}`)).catch(() => {});
  }, [sb, router]);

  // Ranked queue: keep asking the server for a match every 2 seconds. Queue rows unpolled for
  // 10 s are skipped by matchmaking, so this loop depends on nothing but `searching`: the warmup
  // and the clock below re-render the lobby without restarting it.
  useEffect(() => {
    if (!searching) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const id = await api.joinQueue(sb);
        // Matched just as the queue was cancelled: the match exists, so open it as before.
        if (stopped) return void (id && router.push(`/match/${id}`));
        if (id) {
          router.prefetch(`/match/${id}`);
          setFoundLeft(Math.ceil(FOUND_HOLD_MS / 1000));
          setFound(id);
          return;
        }
      } catch (e) {
        setError(friendlyError(e));
        setSearching(false);
        return;
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [searching, sb, router, setError]);

  // Time in queue, once a second, separate from the poll so a slow request doesn't stall it.
  useEffect(() => {
    if (!searching || found) return;
    const t = setInterval(() => setWaitedSec(Math.floor((Date.now() - queuedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [searching, found]);

  // Match found: say so for a moment, then open it the way the queue always has.
  useEffect(() => {
    if (!found) return;
    const at = Date.now();
    const t = setInterval(() => setFoundLeft(Math.ceil((FOUND_HOLD_MS - (Date.now() - at)) / 1000)), 250);
    const go = setTimeout(() => router.push(`/match/${found}`), FOUND_HOLD_MS);
    return () => {
      clearInterval(t);
      clearTimeout(go);
    };
  }, [found, router]);

  function startSearch() {
    setError(null);
    setFound(null);
    setWaitedSec(0);
    queuedAt.current = Date.now();
    setSearching(true);
  }

  async function cancelSearch() {
    if (found) return;
    setSearching(false);
    await api.leaveQueue(sb).catch(() => {});
  }

  async function joinFriend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      router.push(`/match/${await api.joinFriendMatch(sb, joinCode)}`);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  // The switch locks while you're queued or holding a friend code, so neither is left running unseen.
  const locked = searching || !!friendCode;
  const ranked = mode === "ranked";

  return (
    <section aria-labelledby="play-title" className={`${card} flex flex-col gap-[18px] px-5 py-5 md:px-6 md:py-[22px]`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="play-title" className="text-[24px] leading-tight font-semibold tracking-[-0.035em]">
            {ranked ? "Ranked duel" : "Unranked duel"}
          </h2>
          <p className={`${mono} mt-1`}>3 questions · 5:00 · {ranked ? "Elo at stake" : "No rating change"}</p>
        </div>
        <div className="flex gap-1 rounded-(--radius-md) border border-line bg-bg p-[3px]" role="group" aria-label="Duel type">
          <button type="button" className={segment} aria-pressed={ranked} disabled={locked && !ranked} onClick={() => setMode("ranked")}>
            Ranked
          </button>
          <button type="button" className={segment} aria-pressed={!ranked} disabled={locked && ranked} onClick={() => setMode("unranked")}>
            Unranked
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {ranked ? (
          searching ? (
            <div className="flex flex-wrap items-center gap-3.5">
              <p
                aria-live="polite"
                className="flex h-11 items-center gap-2.5 rounded-(--radius-md) border border-[#2c2c33] px-[18px] font-mono text-[13px] tabular-nums"
              >
                <span aria-hidden="true" className="size-[7px] rounded-full bg-accent" />
                {found ? `MATCH FOUND · STARTING IN ${Math.max(1, foundLeft)}` : `SEARCHING · ${clock(waitedSec)}`}
              </p>
              {!found && (
                <button type="button" onClick={cancelSearch} className={quiet}>
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <button type="button" onClick={startSearch} className={primary}>
              Find match
            </button>
          )
        ) : friendCode ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-live="polite">
            <p className="font-mono text-[28px] leading-none font-semibold tracking-[0.12em] tabular-nums">
              <span className="sr-only">Your code </span>
              {friendCode.code}
            </p>
            <button type="button" onClick={() => copy("link", inviteLink)} className={quiet}>
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button type="button" onClick={() => copy("code", friendCode.code)} className={quiet}>
              {copied === "code" ? "Code copied" : "Copy code"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={createFriend} className={primary}>
              Create a game
            </button>
            <form onSubmit={joinFriend} className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="Code"
                aria-label="Friend's code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="h-11 w-[7.5rem] min-w-0 rounded-(--radius-md) border border-line bg-bg px-3.5 font-mono text-[15px] tracking-[0.12em] text-text uppercase tabular-nums placeholder:font-sans placeholder:tracking-normal placeholder:text-text-muted placeholder:normal-case"
              />
              <button disabled={joinCode.length !== 6} className={outline}>
                Join
              </button>
            </form>
          </div>
        )}

        <Link href="/practice" className="ml-auto inline-flex min-h-11 items-center text-[13px] text-text-muted hover:text-text">
          Infinite practice →
        </Link>
      </div>

      {ranked && searching && !found && (
        <p className="-mt-2 text-[13px] text-text-muted">
          {waitedSec < 15 ? "Looking near your rating." : waitedSec < 30 ? "Widening the search." : "Matching you with a recorded run."}
        </p>
      )}
      {!ranked && friendCode && (
        <p className="-mt-2 text-[13px] text-text-muted">Waiting for your friend. Send the link or the code.</p>
      )}
      {ranked && searching && (
        <div className="border-t border-line pt-5">
          <QueueWarmup elapsedSec={waitedSec} found={found ? foundLeft : null} />
        </div>
      )}

      {error && (
        <p role="alert" className="text-[14px] font-medium text-accent-text">
          {error}
        </p>
      )}
    </section>
  );
}
