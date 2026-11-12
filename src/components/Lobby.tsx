"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { quiet, secondary } from "@/components/ui";
import QueueWarmup from "@/components/QueueWarmup";

const POLL_MS = 2000;
/** How long "Opponent found" shows before the match opens. Matches start 5 s after they're made. */
const FOUND_HOLD_MS = 3000;

/**
 * The page's one primary button with the rank sentence beside it, then three numbered statements:
 * Ranked, Practice, Play a friend. Searching and friend-waiting live inline in their rows.
 * `standing` is the rank sentence set beside the button ("Scholar. 1,142 Elo.").
 */
export default function Lobby({ streak, standing }: { streak: number; standing: ReactNode }) {
  const router = useRouter();
  const sb = useRef(createClient()).current;
  const [searching, setSearching] = useState(false);
  const [waitedSec, setWaitedSec] = useState(0);
  /** The ranked match the queue returned, held for FOUND_HOLD_MS before opening it. */
  const [found, setFound] = useState<string | null>(null);
  const [foundLeft, setFoundLeft] = useState(0);
  const [friendCode, setFriendCode] = useState<{ match_id: string; code: string } | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queuedAt = useRef(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

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
  }, [searching, sb, router]);

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

  // Friend game: wait for the friend to join.
  useEffect(() => {
    if (!friendCode) return;
    const t = setInterval(async () => {
      const m = await api.getMatch(sb, friendCode.match_id).catch(() => null);
      if (m && m.status !== "waiting") router.push(`/match/${m.id}`);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [friendCode, sb, router]);

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

  async function createFriend() {
    setError(null);
    try {
      setFriendCode(await api.createFriendMatch(sb));
    } catch (e) {
      setError(friendlyError(e));
    }
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

  function copy(what: "link" | "code", text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        setCopied(what);
        copiedTimer.current = setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => {});
  }

  const inviteLink = friendCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${friendCode.code}` : "";

  return (
    <>
      <section aria-label="Ranked">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-8">
          <button
            onClick={startSearch}
            disabled={searching}
            className="inline-flex h-14 flex-none items-center rounded-(--r-md) bg-ink px-8 text-[17px] font-bold text-on-ink disabled:opacity-40 max-sm:w-full max-sm:justify-center"
          >
            {found ? "Match found" : searching ? "Searching…" : "Play ranked"}
          </button>
          <p className="text-[19px] leading-[29px] text-ink-muted tabular-nums">{standing}</p>
        </div>
      </section>

      <ol aria-label="Ways to play" className="@container mt-16 border-t border-hairline md:mt-20">
        <Statement
          n={1}
          title="Ranked"
          live
          claim={
            found ? (
              <>
                Opponent found. Starting in <span className="tabular-nums">{Math.max(1, foundLeft)}</span>…
              </>
            ) : searching ? (
              <>
                Finding an opponent…
                <span className="block">
                  {waitedSec < 15 ? "Looking near your rating" : waitedSec < 30 ? "Widening the search" : "Matching you with a recorded run"}
                </span>
              </>
            ) : (
              "Three problems, five minutes, focus mode."
            )
          }
          detail={searching && <QueueWarmup elapsedSec={waitedSec} found={found ? foundLeft : null} />}
          action={
            searching ? (
              <button onClick={cancelSearch} disabled={!!found} className={`${secondary} disabled:opacity-40`}>
                Cancel
              </button>
            ) : (
              <Link href="/rules" className={quiet}>
                The rules →
              </Link>
            )
          }
        />

        <Statement
          n={2}
          title="Practice"
          claim={
            <>
              Endless and unranked. Streak <span className="font-semibold text-ink tabular-nums">{streak}</span>.
            </>
          }
          action={
            <Link href="/practice" className={secondary}>
              Practice
            </Link>
          }
        />

        <Statement
          n={3}
          title="Play a friend"
          live
          claim={
            friendCode ? (
              <>
                <span className="mt-2 block text-[44px] leading-[1] font-extrabold tracking-[0.12em] break-all text-ink tabular-nums">
                  <span className="sr-only">Your code </span>
                  {friendCode.code}
                </span>
                <span className="mt-3 block">Waiting for your friend. Friend games don&apos;t change your rating.</span>
              </>
            ) : (
              "Unrated. Send a code, or enter one."
            )
          }
          action={
            friendCode ? (
              <div className="flex flex-wrap gap-x-5">
                <button onClick={() => copy("link", inviteLink)} className={quiet}>
                  {copied === "link" ? "Link copied" : "Copy link"}
                </button>
                <button onClick={() => copy("code", friendCode.code)} className={quiet}>
                  {copied === "code" ? "Code copied" : "Copy code"}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={createFriend} className={secondary}>
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
                    className="h-11 w-[8.5rem] min-w-0 rounded-(--r-md) border border-hairline bg-sunken px-4 text-[17px] font-semibold tracking-[0.12em] text-ink uppercase tabular-nums placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-muted placeholder:normal-case"
                  />
                  <button disabled={joinCode.length !== 6} className={`${secondary} flex-none disabled:opacity-40`}>
                    Join
                  </button>
                </form>
              </div>
            )
          }
        />
      </ol>

      {error && (
        <p role="alert" className="mt-4 text-[15px] leading-[22px]">
          {error}
        </p>
      )}
    </>
  );
}

/** "1. Ranked" in 600 with its claim in ink-muted beneath; the action on the right. Hairline between rows. */
function Statement({
  n,
  title,
  claim,
  action,
  live,
  detail,
}: {
  n: number;
  title: string;
  claim: ReactNode;
  action: ReactNode;
  live?: boolean;
  /** Full-width content under the row, indented to the title. */
  detail?: ReactNode;
}) {
  return (
    <li className="border-b border-hairline py-6">
      <div className="flex flex-col gap-4 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-8">
        <div className="flex min-w-0 gap-3">
          <span className="w-6 flex-none font-semibold text-ink-muted tabular-nums">{n}.</span>
          <div className="min-w-0">
            <h2 className="font-semibold">{title}</h2>
            <p aria-live={live ? "polite" : undefined} className="text-ink-muted">
              {claim}
            </p>
          </div>
        </div>
        <div className="flex-none pl-9 @xl:pl-0">{action}</div>
      </div>
      {detail && <div className="mt-6 @md:pl-9">{detail}</div>}
    </li>
  );
}
