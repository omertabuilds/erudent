"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError, type MatchState, type Slot } from "@/lib/erudent";
import QuestionCanvas from "@/components/QuestionCanvas";

const POLL_MS = 1500;
const HEARTBEAT_MS = 5000;
const SLOTS: Slot[] = ["A", "B", "C"];

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function MatchRoom({ matchId }: { matchId: string }) {
  const sb = useRef(createClient()).current;
  const [match, setMatch] = useState<MatchState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // server clock minus this device's clock
  const [now, setNow] = useState(() => Date.now());
  const [slot, setSlot] = useState<Slot>("A");
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const finishing = useRef(false);
  const slotRef = useRef<Slot>("A");
  slotRef.current = slot;

  const refresh = useCallback(async () => {
    const before = Date.now();
    try {
      const m = await api.getMatch(sb, matchId);
      const after = Date.now();
      // Assume the server stamped its time halfway through the request.
      setOffset(new Date(m.server_now).getTime() - (before + after) / 2);
      setMatch(m);
    } catch (e) {
      setLoadError(friendlyError(e));
    }
  }, [sb, matchId]);

  // Poll match state; stop once it's over.
  useEffect(() => {
    refresh();
    if (match?.status === "finished") return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh, match?.status]);

  // Local clock tick for a smooth timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const serverNow = now + offset;
  const startsAt = match?.started_at ? new Date(match.started_at).getTime() : null;
  const endsAt = match?.ends_at ? new Date(match.ends_at).getTime() : null;
  const phase: "loading" | "waiting" | "countdown" | "live" | "finished" =
    !match ? "loading"
    : match.status === "finished" ? "finished"
    : match.status === "waiting" || !startsAt ? "waiting"
    : serverNow < startsAt ? "countdown"
    : "live";
  const focusMode = match ? match.mode !== "friend" : false;

  // Heartbeat so the server knows we're here; also claim a win if the opponent vanished.
  useEffect(() => {
    if (phase !== "countdown" && phase !== "live") return;
    const beat = async () => {
      await api.heartbeat(sb, matchId).catch(() => {});
      if (match?.mode !== "async") {
        const r = await api.claimForfeit(sb, matchId).catch(() => null);
        if (r?.status === "opponent_forfeited") refresh();
      }
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [phase, sb, matchId, match?.mode, refresh]);

  // Time's up: ask the server to close the match (safe to call more than once).
  useEffect(() => {
    if (phase === "live" && endsAt && serverNow >= endsAt && !finishing.current) {
      finishing.current = true;
      api.finishMatch(sb, matchId).then(setMatch).catch(() => {}).finally(() => { finishing.current = false; });
    }
  }, [phase, endsAt, serverNow, sb, matchId]);

  // Focus mode: leaving the tab or window is reported to the server.
  useEffect(() => {
    if (!focusMode || phase !== "live") return;
    let lastReport = 0;
    const report = async () => {
      if (Date.now() - lastReport < 1500) return; // blur + hidden fire together
      lastReport = Date.now();
      const r = await api.focusEvent(sb, matchId, slotRef.current).catch(() => null);
      if (r?.status === "warning") setNotice("Focus mode: you left the match. Next time, you lose the question on screen.");
      if (r?.status === "forfeited_question") setNotice(`You left again. Question ${r.slot} is forfeited.`);
      if (r?.status === "flagged") setNotice("You left the match again. This match has been flagged.");
      refresh();
    };
    const onVisibility = () => document.visibilityState === "hidden" && report();
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", report);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", report);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
    };
  }, [focusMode, phase, sb, matchId, refresh]);

  // Leave fullscreen when the match ends.
  useEffect(() => {
    if (phase === "finished" && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [phase]);

  const answered = new Map(match?.me.answers.map((a) => [a.slot, a]) ?? []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const r = await api.submitAnswer(sb, matchId, slot, input);
      if (r.status === "invalid_format") setNotice("Answer with an integer or a fraction like 3/4. No decimals.");
      else if (r.status === "ok") {
        setNotice(r.correct ? `Correct. +${match?.questions.find((q) => q.slot === slot)?.points ?? 0}` : "Wrong. That question is locked.");
        setInput("");
        const nextOpen = SLOTS.find((s) => s !== slot && !answered.has(s));
        if (nextOpen) setSlot(nextOpen);
      } else if (r.status === "time_up" || r.status === "match_over") setNotice("Time's up.");
      await refresh();
    } catch (err) {
      setNotice(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
        <p>{loadError}</p>
        <Link href="/play" className="underline">Back to lobby</Link>
      </main>
    );
  }
  if (!match) return <main className="flex min-h-screen items-center justify-center text-muted">Loading…</main>;

  if (phase === "waiting") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
        <p className="text-muted">Waiting for your friend to join</p>
        {match.invite_code && <span className="font-mono text-4xl tracking-[0.3em]">{match.invite_code}</span>}
        <Link href="/play" className="text-sm underline">Back to lobby</Link>
      </main>
    );
  }

  if (phase === "finished") return <Results match={match} matchId={matchId} />;

  const opp = match.opponent;
  const question = match.questions.find((q) => q.slot === slot);
  const mine = answered.get(slot);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex flex-col">
          <span className="text-sm">@{match.me.username}</span>
          <span className="text-xs text-muted">{match.me.rank}</span>
        </div>
        <span className="font-mono text-3xl tabular-nums">
          {phase === "countdown" ? formatClock(startsAt! - serverNow) : formatClock(endsAt! - serverNow)}
        </span>
        <div className="flex flex-col items-end">
          <span className="text-sm">@{opp?.username ?? "…"}{opp?.is_ghost && <span className="text-muted"> (recorded)</span>}</span>
          <span className="flex gap-1 text-xs">
            {SLOTS.map((s) => (
              <span key={s} className={opp?.solved.includes(s) ? "bg-foreground px-1 text-background" : "border border-line px-1 text-muted"}>{s}</span>
            ))}
          </span>
        </div>
      </header>

      {phase === "countdown" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <span className="font-serif text-7xl">{Math.max(1, Math.ceil((startsAt! - serverNow) / 1000))}</span>
          <span className="text-muted">{match.mode === "friend" ? "Friend match · unranked" : match.mode === "async" ? "Ranked · vs a recorded run" : "Ranked"}</span>
          {focusMode && (
            <>
              <p className="max-w-sm text-sm text-muted">
                Focus mode is on. Leaving this tab once is a warning. The second time, you lose the question on screen.
              </p>
              <button
                onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
                className="border border-foreground px-4 py-2 text-sm"
              >
                Go fullscreen
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <nav className="grid grid-cols-3 gap-2">
            {match.questions.map((q) => {
              const a = answered.get(q.slot);
              return (
                <button
                  key={q.slot}
                  onClick={() => { setSlot(q.slot); setNotice(null); }}
                  className={`flex flex-col items-start border px-3 py-2 text-left ${slot === q.slot ? "border-foreground" : "border-line"}`}
                >
                  <span className="text-sm">{q.slot} · {q.points} {q.points === 1 ? "pt" : "pts"}</span>
                  <span className="text-xs text-muted">
                    {!a ? q.topic : a.answer === null ? "Forfeited" : a.correct ? "Correct" : "Wrong"}
                  </span>
                </button>
              );
            })}
          </nav>

          {question && (
            <section className="flex flex-col gap-6 border border-line p-5">
              {focusMode ? <QuestionCanvas text={question.prompt} /> : <p className="font-serif text-xl whitespace-pre-wrap">{question.prompt}</p>}
              {mine ? (
                <p className="text-sm text-muted">
                  {mine.answer === null ? "Forfeited." : `You answered ${mine.answer}. ${mine.correct ? "Correct." : "Wrong."}`}
                </p>
              ) : (
                <form onSubmit={submit} className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    inputMode="text"
                    autoComplete="off"
                    autoFocus
                    placeholder="Integer or fraction, e.g. 12 or 3/4"
                    className="w-full min-w-0 border border-line bg-background px-3 py-3 font-mono outline-none focus:border-foreground"
                  />
                  <button disabled={submitting || !input.trim()} className="border border-foreground bg-foreground px-5 text-background disabled:opacity-40">
                    Submit
                  </button>
                </form>
              )}
              <p className="text-xs text-muted">One try per question. All or nothing.</p>
            </section>
          )}
        </>
      )}

      {notice && <p className="text-sm">{notice}</p>}
    </main>
  );
}

function Results({ match, matchId }: { match: MatchState; matchId: string }) {
  const sb = useRef(createClient()).current;
  const [reported, setReported] = useState<Set<string>>(new Set());
  const me = match.me;
  const opp = match.opponent;
  const eloChange = me.elo_after !== null ? me.elo_after - me.elo_before : 0;
  const headline = me.result === "win" ? "You won" : me.result === "loss" ? "You lost" : "Draw";
  const forfeitNote =
    match.forfeited_by ? (match.forfeited_by === me.user_id ? "You disconnected." : "Your opponent disconnected.") : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <section className="flex flex-col gap-2">
        <h1 className="font-serif text-5xl">{headline}</h1>
        <p className="text-lg">
          {me.score} – {opp?.score ?? 0} <span className="text-muted">vs @{opp?.username}{opp?.is_ghost && " (recorded)"}</span>
        </p>
        {forfeitNote && <p className="text-sm text-muted">{forfeitNote}</p>}
        {match.mode === "friend" ? (
          <p className="text-sm text-muted">Friend match · rating unchanged</p>
        ) : (
          <p className="text-sm">
            {eloChange >= 0 ? "+" : ""}{eloChange} Elo · {me.rank}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        {match.questions.map((q) => {
          const a = me.answers.find((x) => x.slot === q.slot);
          return (
            <article key={q.slot} className="flex flex-col gap-2 border border-line p-5">
              <div className="flex justify-between text-sm">
                <span>{q.slot} · {q.points} {q.points === 1 ? "pt" : "pts"} · {q.topic}</span>
                <span className="text-muted">{!a ? "Not answered" : a.answer === null ? "Forfeited" : a.correct ? "Correct" : `You: ${a.answer}`}</span>
              </div>
              <p className="font-serif whitespace-pre-wrap">{q.prompt}</p>
              <p className="text-sm">Answer: <span className="font-mono">{q.answer}</span></p>
              {q.solution && <p className="text-sm text-muted whitespace-pre-wrap">{q.solution}</p>}
              <button
                disabled={reported.has(q.slot)}
                onClick={() => {
                  const reason = window.prompt("What's wrong with this question?");
                  if (!reason) return;
                  api.reportQuestion(sb, matchId, q.slot, reason).catch(() => {});
                  setReported((s) => new Set(s).add(q.slot));
                }}
                className="self-start text-xs text-muted underline disabled:no-underline"
              >
                {reported.has(q.slot) ? "Reported" : "Report question"}
              </button>
            </article>
          );
        })}
      </section>

      <div className="flex items-center justify-between">
        <Link href="/play" className="border border-foreground bg-foreground px-5 py-3 text-background">Play again</Link>
        {opp && !opp.is_ghost && (
          <button
            disabled={reported.has("player")}
            onClick={() => {
              const reason = window.prompt("What happened?");
              if (!reason) return;
              api.reportPlayer(sb, matchId, reason).catch(() => {});
              setReported((s) => new Set(s).add("player"));
            }}
            className="text-xs text-muted underline disabled:no-underline"
          >
            {reported.has("player") ? "Reported" : `Report @${opp.username}`}
          </button>
        )}
      </div>
    </main>
  );
}
