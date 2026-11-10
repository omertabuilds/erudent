"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";
import { caption, cardTitle, kicker, panel, pill, quiet, secondary } from "@/components/ui";

const POLL_MS = 2000;

const SUBJECTS = ["Math", "Coding", "Finance", "Law", "Med"] as const;

export default function Lobby({ streak }: { streak: number }) {
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
    <div className="flex flex-col gap-12 md:gap-16">
      <section aria-labelledby="subject-title" className="flex flex-col gap-3">
        <h2 id="subject-title" className={kicker}>
          Subject
        </h2>
        <ul className="flex flex-wrap gap-x-2 gap-y-3">
          {SUBJECTS.map((s) =>
            s === "Math" ? (
              <li key={s} className="flex flex-col gap-1">
                <span aria-current="true" className={pill(true)}>
                  {s}
                </span>
              </li>
            ) : (
              <li key={s} className="flex flex-col items-center gap-1">
                <span
                  aria-disabled="true"
                  aria-describedby={`soon-${s}`}
                  className="inline-flex h-11 cursor-default items-center rounded-(--r-pill) border border-hairline px-4 text-[15px] font-semibold text-ink-muted"
                >
                  {s}
                </span>
                <span id={`soon-${s}`} className={caption}>
                  Soon
                </span>
              </li>
            ),
          )}
        </ul>
      </section>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="ranked-title" className={panel}>
          <h2 id="ranked-title" className={kicker}>
            Ranked
          </h2>
          <div aria-live="polite" className="mt-6">
            {searching ? (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className={cardTitle}>
                    Finding an opponent… <span className="tabular-nums">{waitedSec}s</span>
                  </p>
                  <p className={caption}>
                    {waitedSec < 15 ? "Looking near your rating" : waitedSec < 30 ? "Widening the search" : "Matching you with a recorded run"}
                  </p>
                </div>
                <button onClick={cancelSearch} className={secondary}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <button
                  onClick={() => {
                    setError(null);
                    setSearching(true);
                  }}
                  className="inline-flex h-14 items-center rounded-(--r-md) bg-ink px-8 text-[17px] font-bold text-on-ink max-sm:w-full max-sm:justify-center"
                >
                  Play ranked
                </button>
                <p className={`${caption} tabular-nums`}>3 problems · 5 minutes · focus mode</p>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Link
            href="/practice"
            className="flex flex-col rounded-(--r-md) border border-rule p-6 hover:border-ink md:p-8"
          >
            <span className={kicker}>Practice</span>
            <span className="mt-6 text-[22px] leading-[28px] font-extrabold tracking-[-0.01em]">Endless. Unranked.</span>
            <span className="mt-auto flex items-baseline justify-between gap-4 pt-6">
              <span className="text-[15px] text-ink-muted">
                Streak <span className="font-semibold text-ink tabular-nums">{streak}</span>
              </span>
              <span aria-hidden="true" className="font-semibold">
                →
              </span>
            </span>
          </Link>

          <section aria-labelledby="friend-title" className={panel}>
            <h2 id="friend-title" className={kicker}>
              Play a friend
            </h2>
            {friendCode ? (
              <div className="mt-6 flex flex-col">
                <p className="text-[13px] leading-[18px] font-semibold text-ink-muted">Your code</p>
                <p className="mt-1 text-[44px] leading-[1] font-extrabold tracking-[0.12em] break-all tabular-nums">{friendCode.code}</p>
                <div className="mt-3 flex flex-wrap gap-x-5">
                  <button onClick={() => copy("link", inviteLink)} className={quiet}>
                    {copied === "link" ? "Link copied" : "Copy link"}
                  </button>
                  <button onClick={() => copy("code", friendCode.code)} className={quiet}>
                    {copied === "code" ? "Code copied" : "Copy code"}
                  </button>
                </div>
                <p role="status" className={`${caption} mt-2`}>
                  Waiting for your friend… Friend games don&apos;t change your rating.
                </p>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-4">
                <button onClick={createFriend} className={`${secondary} justify-center`}>
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
                    className="h-11 w-full min-w-0 rounded-(--r-md) border border-hairline bg-sunken px-4 text-[17px] font-semibold tracking-[0.12em] text-ink uppercase tabular-nums placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-muted placeholder:normal-case"
                  />
                  <button disabled={joinCode.length !== 6} className={`${secondary} flex-none disabled:opacity-40`}>
                    Join
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>

        {error && (
          <p role="alert" className="text-[15px] leading-[22px]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
