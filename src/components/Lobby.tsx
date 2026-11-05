"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError } from "@/lib/erudent";

const POLL_MS = 2000;

export default function Lobby() {
  const router = useRouter();
  const sb = useRef(createClient()).current;
  const [searching, setSearching] = useState(false);
  const [waitedSec, setWaitedSec] = useState(0);
  const [friendCode, setFriendCode] = useState<{ match_id: string; code: string } | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  const inviteLink = friendCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${friendCode.code}` : "";

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-widest text-muted">Ranked</h2>
        {searching ? (
          <div className="flex items-center justify-between border border-foreground p-5">
            <div className="flex flex-col">
              <span>Finding an opponent… {waitedSec}s</span>
              <span className="text-xs text-muted">
                {waitedSec < 15 ? "Looking near your rating" : waitedSec < 30 ? "Widening the search" : "Matching you with a recorded run"}
              </span>
            </div>
            <button onClick={cancelSearch} className="text-sm underline">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setError(null); setSearching(true); }}
            className="border border-foreground bg-foreground px-4 py-4 text-lg text-background"
          >
            Play ranked
          </button>
        )}
        <p className="text-xs text-muted">3 questions · 5 minutes · focus mode on</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-widest text-muted">Play a friend</h2>
        {friendCode ? (
          <div className="flex flex-col gap-3 border border-line p-5">
            <span className="font-mono text-3xl tracking-[0.3em]">{friendCode.code}</span>
            <div className="flex gap-3 text-sm">
              <button onClick={() => navigator.clipboard.writeText(inviteLink)} className="underline">Copy link</button>
              <button onClick={() => navigator.clipboard.writeText(friendCode.code)} className="underline">Copy code</button>
            </div>
            <span className="text-xs text-muted">Waiting for your friend… Friend games don&apos;t change your rating.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={createFriend} className="flex-1 border border-foreground px-4 py-3">Create a game</button>
            <form onSubmit={joinFriend} className="flex flex-1 gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="CODE"
                className="w-full min-w-0 border border-line bg-background px-3 py-3 font-mono tracking-widest outline-none focus:border-foreground"
              />
              <button disabled={joinCode.length !== 6} className="border border-foreground px-4 disabled:opacity-40">Join</button>
            </form>
          </div>
        )}
      </section>

      {error && <p className="text-sm">{error}</p>}
    </div>
  );
}
