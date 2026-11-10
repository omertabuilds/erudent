"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { kicker, quiet, secondary } from "@/components/ui";

const POLL_MS = 2000;

/**
 * The hero (statement + the page's one primary button) and three numbered statements:
 * Ranked, Practice, Play a friend. Searching and friend-waiting live inline in their rows.
 * `standing` is the rank sentence set beside the button ("Scholar. 1,142 Elo.").
 */
export default function Lobby({ streak, standing }: { streak: number; standing: ReactNode }) {
  const router = useRouter();
  const sb = useRef(createClient()).current;
  const [searching, setSearching] = useState(false);
  const [waitedSec, setWaitedSec] = useState(0);
  const [friendCode, setFriendCode] = useState<{ match_id: string; code: string } | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  // If you closed the tab mid-match, send you back in.
  useEffect(() => {
    api.myActiveMatch(sb).then((id) => id && router.replace(`/match/${id}`)).catch(() => {});
  }, [sb, router]);

  // Ranked queue: keep asking the server for a match every 2 seconds.
  useEffect(() => {
    if (!searching) return;
    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped) return;
      setWaitedSec(Math.floor((Date.now() - started) / 1000));
      try {
        const id = await api.joinQueue(sb);
        if (id) return router.push(`/match/${id}`);
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

  // Friend game: wait for the friend to join.
  useEffect(() => {
    if (!friendCode) return;
    const t = setInterval(async () => {
      const m = await api.getMatch(sb, friendCode.match_id).catch(() => null);
      if (m && m.status !== "waiting") router.push(`/match/${m.id}`);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [friendCode, sb, router]);

  async function cancelSearch() {
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
      <section aria-labelledby="lobby-title">
        <p className={kicker}>Lobby</p>
        <h1 id="lobby-title" className="mt-4 text-[clamp(36px,5vw,56px)] leading-[1] font-extrabold tracking-[-0.03em]">
          There exists a faster solver than you.
        </h1>
        <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-8">
          <button
            onClick={() => {
              setError(null);
              setSearching(true);
            }}
            disabled={searching}
            className="inline-flex h-14 flex-none items-center rounded-(--r-md) bg-ink px-8 text-[17px] font-bold text-on-ink disabled:opacity-40 max-sm:w-full max-sm:justify-center"
          >
            {searching ? "Searching…" : "Play ranked"}
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
            searching ? (
              <>
                Finding an opponent… <span className="tabular-nums">{waitedSec}s</span>
                <span className="block">
                  {waitedSec < 15 ? "Looking near your rating" : waitedSec < 30 ? "Widening the search" : "Matching you with a recorded run"}
                </span>
              </>
            ) : (
              "Three problems, five minutes, focus mode."
            )
          }
          action={
            searching ? (
              <button onClick={cancelSearch} className={secondary}>
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
function Statement({ n, title, claim, action, live }: { n: number; title: string; claim: ReactNode; action: ReactNode; live?: boolean }) {
  return (
    <li className="flex flex-col gap-4 border-b border-hairline py-6 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-8">
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
    </li>
  );
}
