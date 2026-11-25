"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { disconnectLeft } from "@/lib/disconnect";
import { api, avatarUrl, friendlyError, TIER_NAMES, type MatchState, type Slot } from "@/lib/erudent";
import QuestionCanvas from "@/components/QuestionCanvas";
import QuestionReport from "@/components/QuestionReport";
import RankBadge, { type Rank } from "@/components/RankBadge";
import Workspace, { type Stroke } from "@/components/Workspace";

const POLL_MS = 1500;
/** Well under DISCONNECT_AFTER_MS (5s) even with a poll's delay on top, so a live opponent never flickers as gone. */
const HEARTBEAT_MS = 2000;
/** How often to ask the server whether a silent opponent has passed the 30s forfeit. */
const CLAIM_FORFEIT_MS = 5000;
const SLOTS: Slot[] = ["A", "B", "C"];
/** Points per slot before the questions arrive (countdown). get_match's own points win once they do. */
const DEFAULT_POINTS: Record<Slot, number> = { A: 1, B: 2, C: 3 };
const LOW_TIME_MS = 30_000;

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const pts = (n: number) => `${n} ${n === 1 ? "PT" : "PTS"}`;

const BANNER_FILES = ["rank-1-novice", "rank-2-apprentice", "rank-3-scholar", "rank-4-savant", "rank-5-sage", "rank-6-erudite"];

// Shared styles (design system: dark surfaces, hairlines, Geist Mono for numbers and labels).
const mono = "font-mono text-[11px] tracking-[0.12em] uppercase";
const card = "rounded-(--radius-lg) border border-line bg-surface/92";
const primary =
  "inline-flex h-11 flex-none cursor-pointer items-center justify-center rounded-(--radius-md) bg-text px-[22px] text-[15px] font-semibold text-bg hover:bg-text/90 disabled:cursor-default disabled:opacity-40";
const secondary =
  "inline-flex h-11 flex-none cursor-pointer items-center justify-center rounded-(--radius-md) border border-[#2c2c33] px-5 text-[15px] text-text hover:border-text-muted disabled:cursor-default disabled:opacity-40";
const quiet = "inline-flex min-h-11 cursor-pointer items-center text-[14px] text-text-muted hover:text-text";
const caption = "text-[13px] leading-[18px] text-text-muted";

/**
 * Duel screen. Header and footer come from the server page and show only while loading or waiting
 * for a friend; the duel itself has its own top bar. Focus view hides both player cards, widens
 * the problem and workspace, and asks for browser fullscreen.
 */
export default function MatchRoom({ matchId, header, footer }: { matchId: string; header?: ReactNode; footer?: ReactNode }) {
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
  const [places, setPlaces] = useState<Record<string, number | null>>({});
  const [focusView, setFocusView] = useState(false);
  const [workspace, setWorkspace] = useState<"scratch" | "draw">("scratch");
  const [scratch, setScratch] = useState("");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const slotRef = useRef<Slot>("A");
  slotRef.current = slot;

  const refresh = useCallback(async () => {
    const before = Date.now();
    try {
      const m = await api.getMatch(sb, matchId);
      const after = Date.now();
      // Assume the server stamped its time halfway through the request.
      const off = new Date(m.server_now).getTime() - (before + after) / 2;
      setOffset(off);
      setMatch(m);
    } catch (e) {
      setLoadError(friendlyError(e));
    }
  }, [sb, matchId]);

  // Poll match state; stop once it's over.
  useEffect(() => {
    refresh();
    if (match?.status === "finished" || match?.status === "void") return;
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
    : match.status === "finished" || match.status === "void" ? "finished"
    : match.status === "waiting" || !startsAt ? "waiting"
    : serverNow < startsAt ? "countdown"
    : "live";
  const focusMode = match ? match.mode !== "friend" : false;

  // Heartbeat so the server knows we're here.
  useEffect(() => {
    if (phase !== "countdown" && phase !== "live") return;
    const beat = () => api.heartbeat(sb, matchId).catch(() => {});
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [phase, sb, matchId]);

  // Claim a win if the opponent vanished (the server decides: 30s of silence).
  useEffect(() => {
    if ((phase !== "countdown" && phase !== "live") || match?.mode === "async") return;
    const claim = async () => {
      const r = await api.claimForfeit(sb, matchId).catch(() => null);
      if (r?.status === "opponent_forfeited") refresh();
    };
    claim();
    const t = setInterval(claim, CLAIM_FORFEIT_MS);
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

  // Global places for both cards, once the usernames are known.
  const meName = match?.me.username;
  const oppName = match?.opponent?.username;
  useEffect(() => {
    for (const name of [meName, oppName]) {
      if (!name) continue;
      api
        .playerPlace(sb, name)
        .then((p) => setPlaces((s) => ({ ...s, [name]: p })))
        .catch(() => {});
    }
  }, [sb, meName, oppName]);

  // Focus view follows fullscreen out: Esc (or the browser's own exit) leaves both.
  useEffect(() => {
    const onChange = () => !document.fullscreenElement && setFocusView(false);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFocusView() {
    const next = !focusView;
    setFocusView(next);
    if (next && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!next && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

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

  async function forfeitDuel() {
    try {
      const r = await api.forfeitMatch(sb, matchId);
      if (r.status === "time_up") setNotice("Time's up.");
    } catch (err) {
      setNotice(friendlyError(err));
    }
    await refresh();
  }

  // ── Render ────────────────────────────────────────────────────────

  if (loadError || !match) {
    return (
      <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
        {header}
        <main className="mx-auto flex w-full max-w-[640px] flex-[1_0_auto] flex-col items-center justify-center gap-6 px-5 py-24 text-center">
          {loadError ? (
            <p role="alert" className="text-[19px] leading-[29px]">
              {loadError}
            </p>
          ) : (
            <p aria-busy="true" className="text-text-muted">
              Loading the duel…
            </p>
          )}
          <Link href="/play" className={secondary}>
            Back to lobby
          </Link>
        </main>
        {footer}
      </div>
    );
  }

  if (phase === "waiting")
    return (
      <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
        {header}
        <Waiting code={match.invite_code} />
        {footer}
      </div>
    );

  const points = (s: Slot) => match.questions.find((q) => q.slot === s)?.points ?? DEFAULT_POINTS[s];
  const maxPoints = SLOTS.reduce((n, s) => n + points(s), 0);
  const finished = phase === "finished";
  const live = phase === "live";
  const focused = focusView && live;
  const oppGone = disconnectLeft(match, live, serverNow);
  const sides = buildSides(sb, match, points, finished, places, live ? slot : null);
  const modeLabel =
    match.mode === "friend" ? "Friend duel · Mathematics" : match.mode === "async" ? "Ranked duel · Recorded run" : "Ranked duel · Mathematics";
  const width = focused ? "max-w-[960px]" : "max-w-[640px]";

  let center: ReactNode;
  if (finished) {
    center = <Results match={match} matchId={matchId} points={points} width={width} />;
  } else if (phase === "countdown") {
    const n = Math.max(1, Math.ceil((startsAt! - serverNow) / 1000));
    center = (
      <section aria-label="Starting" className={`${card} flex w-full ${width} flex-col items-center px-8 py-12 text-center`}>
        <p className={`${mono} text-text-muted`}>{match.mode === "friend" ? "Friend duel · unrated" : "Ranked duel"}</p>
        <p aria-live="polite" className="mt-4 font-mono text-[clamp(96px,18vw,160px)] leading-[0.9] font-medium tracking-[-0.04em] tabular-nums">
          {n}
        </p>
        <p className="mt-6 text-[17px] text-text-muted">Three problems. Five minutes. One try each.</p>
        {focusMode && (
          <div className="mt-8 flex max-w-[440px] flex-col items-center gap-4 border-t border-line pt-6">
            <p className="text-[14px] leading-[21px] text-text-muted">
              <span className="font-semibold text-text">Focus mode is on.</span> Leaving this tab once is a warning. The second time, you lose the problem on
              screen.
            </p>
            <button type="button" onClick={toggleFocusView} className={secondary}>
              Go fullscreen
            </button>
          </div>
        )}
      </section>
    );
  } else {
    // ── Live ──
    const left = endsAt! - serverNow;
    const total = Math.max(1, endsAt! - startsAt!);
    const question = match.questions.find((q) => q.slot === slot);
    const mine = answered.get(slot);
    center = (
      <>
        <div className={`flex w-full ${width} flex-col items-center gap-2.5`}>
          <Clock ms={left} size={focused ? "sm" : "lg"} />
          <TimeBar left={left} total={total} />
          {oppGone !== null && (
            <p className={`${caption} text-center`}>
              Opponent disconnected. If they don&apos;t return in <span className="font-mono text-text tabular-nums">{formatClock(oppGone)}</span>, you
              win by forfeit.
            </p>
          )}
          <p role="status" className="sr-only">
            {oppGone !== null ? "Opponent disconnected." : ""}
          </p>
        </div>

        <div role="tablist" aria-label="Problems" className={`grid w-full ${width} grid-cols-3 gap-1.5`}>
          {match.questions.map((q) => {
            const current = slot === q.slot;
            const mark = sides.me.marks[q.slot];
            return (
              <button
                key={q.slot}
                role="tab"
                id={`tab-${q.slot}`}
                aria-selected={current}
                aria-controls="problem-sheet"
                onClick={() => {
                  setSlot(q.slot);
                  setNotice(null);
                }}
                className="group flex min-h-11 cursor-pointer flex-col justify-end gap-1.5 pt-1"
              >
                <span
                  className={`flex items-center justify-between font-mono text-[11px] tracking-[0.1em] ${current ? "text-text" : "text-text-muted group-hover:text-text"}`}
                >
                  <span>
                    {q.slot} · {pts(q.points)}
                  </span>
                  {mark && (
                    <span className={mark === "solved" ? "text-text" : "text-text-muted"}>
                      <span aria-hidden="true">{mark === "solved" ? "✓" : "✗"}</span>
                      <span className="sr-only">{mark}</span>
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-1 w-full rounded-full ${
                    mark === "solved" ? "bg-text" : mark === "missed" ? "bg-accent-text/50" : current ? "bg-[#55524c]" : "bg-surface-raised"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {question && (
          <section
            id="problem-sheet"
            role="tabpanel"
            aria-labelledby={`tab-${question.slot}`}
            className={`${card} flex w-full ${width} flex-col gap-6 p-6 md:p-8`}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4">
              <p className={`${mono} py-1 text-[#6e6a62]`}>
                Question {question.slot} / C · {question.topic} · {pts(question.points)}
              </p>
              <QuestionReport matchId={matchId} slot={question.slot} compact />
            </div>
            {focusMode ? (
              <QuestionCanvas text={question.prompt} size={focused ? 26 : 22} />
            ) : (
              <p className={`font-mono leading-[1.55] whitespace-pre-wrap ${focused ? "text-[26px]" : "text-[22px]"}`}>{question.prompt}</p>
            )}

            <div>
              {mine ? (
                <p className="text-[17px] leading-[26px] font-medium">
                  {mine.answer === null ? (
                    <span className="text-text-muted">
                      <span className="mr-2">✗</span>Forfeited.
                    </span>
                  ) : mine.correct ? (
                    <>
                      <span className="mr-2">✓</span>You answered <span className="font-mono">{mine.answer}</span>. Correct.
                    </>
                  ) : (
                    <span className="text-text-muted">
                      <span className="mr-2">✗</span>You answered <span className="font-mono">{mine.answer}</span>. Wrong.
                    </span>
                  )}
                </p>
              ) : (
                <form onSubmit={submit} className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    inputMode="text"
                    autoComplete="off"
                    autoFocus
                    aria-label={`Your answer to ${question.slot}`}
                    placeholder="Integer or fraction, like 3/4"
                    className="h-12 w-full min-w-0 rounded-(--radius-md) border border-[#2c2c33] bg-bg px-4 font-mono text-[18px] text-text placeholder:text-[#6e6a62]"
                  />
                  <button disabled={submitting || !input.trim()} className={`${primary} h-12`}>
                    Submit
                  </button>
                </form>
              )}
              <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px] leading-[18px] text-[#6e6a62]">
                {notice ? (
                  <p role="status" className="text-[13px] text-text">
                    {notice}
                  </p>
                ) : (
                  <p>One try per problem. All or nothing.</p>
                )}
                {focusMode && <p>Tab switches are flagged.</p>}
              </div>
            </div>
          </section>
        )}

        <Workspace
          width={width}
          tall={focused}
          mode={workspace}
          setMode={setWorkspace}
          scratch={scratch}
          setScratch={setScratch}
          strokes={strokes}
          setStrokes={setStrokes}
        />
      </>
    );
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-bg font-ui text-[17px] leading-[26px] text-text">
      {/* The mountain, faint, low behind the duel. */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-[55%]">
        <Image src="/images/mountain-hero.jpg" alt="" fill sizes="100vw" className="object-cover object-[50%_70%] opacity-35" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--bg)_0%,color-mix(in_oklab,var(--bg)_55%,transparent)_60%,color-mix(in_oklab,var(--bg)_80%,transparent)_100%)]" />
      </div>

      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-[18px] md:px-10">
        <div className={`flex min-w-0 items-center gap-4 ${mono} text-[#6e6a62]`}>
          <Link href="/play" aria-label="Erudent lobby" className="font-sans text-[20px] leading-none font-bold tracking-normal text-text normal-case">
            ∃
          </Link>
          <span className="truncate">{modeLabel}</span>
        </div>
        {(live || phase === "countdown") && (
          <div className="flex flex-none items-center gap-2">
            <ForfeitButton onConfirm={forfeitDuel} />
            {live && (
              <button
                type="button"
                onClick={toggleFocusView}
                aria-pressed={focused}
                className={`flex h-[30px] flex-none cursor-pointer items-center gap-2 rounded-[6px] border border-[#2c2c33] px-3 ${mono} text-[#d6d2c9] hover:border-text-muted`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={focused ? "M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" : "M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"} />
                </svg>
                {focused ? "Exit focus" : "Focus"}
              </button>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 md:px-10 md:py-8">
        <h1 className="sr-only">
          Duel: @{match.me.username} against {match.opponent ? `@${match.opponent.username}` : "an opponent"}
        </h1>

        {!focused && (
          <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line pb-4 lg:hidden">
            <CompactPlayer side={sides.me} max={maxPoints} />
            <span className={`${mono} text-text-muted`}>vs</span>
            {sides.opp ? <CompactPlayer side={sides.opp} max={maxPoints} flip gone={oppGone !== null} /> : <span />}
          </div>
        )}

        <div className="flex items-start gap-8">
          {!focused && (
            <div className="hidden w-[240px] flex-none lg:block">
              <PlayerCard side={sides.me} max={maxPoints} />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-7">{center}</div>
          {!focused && (
            <div className="hidden w-[240px] flex-none lg:block">{sides.opp ? <PlayerCard side={sides.opp} max={maxPoints} flip gone={oppGone} /> : null}</div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Forfeit ─────────────────────────────────────────────────────────

/**
 * Top-bar Forfeit with a confirm. An in-page <dialog>, not window.confirm(): a native prompt blurs
 * the window, which focus mode would report as leaving the match.
 */
function ForfeitButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      dialog.current?.close();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={`flex h-[30px] cursor-pointer items-center rounded-[6px] border border-[#2c2c33] px-3 ${mono} text-[#d6d2c9] hover:border-accent-text hover:text-accent-text`}
      >
        Forfeit
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(400px,calc(100vw-32px))] rounded-(--radius-lg) border border-line bg-surface p-6 text-text backdrop:bg-black/60"
      >
        <h2 id={titleId} className="text-[19px] leading-[26px] font-semibold tracking-[-0.02em]">
          Forfeit this duel?
        </h2>
        <p className="mt-2 text-[15px] leading-[22px] text-text-muted">It counts as a loss.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" autoFocus onClick={() => dialog.current?.close()} className={secondary}>
            Keep playing
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-(--radius-md) bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent/90 disabled:cursor-default disabled:opacity-40"
          >
            {busy ? "Forfeiting…" : "Forfeit"}
          </button>
        </div>
      </dialog>
    </>
  );
}

// ── Sides ───────────────────────────────────────────────────────────

type Mark = "solved" | "missed" | null;
/** A slot's line on a player card: SOLVED 1:04, WORKING, MISSED, FORFEITED or —. */
type Status = { slot: Slot; points: number; text: string; tone: "on" | "mid" | "off" };

type Side = {
  you: boolean;
  username: string;
  avatar: string | null;
  rank: string;
  tier: number; // 1–6, 0 while unranked
  /** Ring, badge and rank colors: off for recorded runs and unranked players. */
  marked: boolean;
  elo: number;
  place: number | null;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  marks: Record<Slot, Mark>;
  statuses: Status[];
  ghost: boolean;
};

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function buildSides(
  sb: ReturnType<typeof createClient>,
  m: MatchState,
  points: (s: Slot) => number,
  finished: boolean,
  places: Record<string, number | null>,
  working: Slot | null,
) {
  const tierOf = (rank: string) => TIER_NAMES.indexOf(rank as (typeof TIER_NAMES)[number]) + 1;
  // Solve times are the server's stamps, measured from the match start.
  const start = m.started_at ? Date.parse(m.started_at) : NaN;
  const solvedText = (at: string | undefined) => {
    const ms = at ? Date.parse(at) - start : NaN;
    return Number.isFinite(ms) ? `SOLVED ${elapsed(ms)}` : "SOLVED";
  };
  const myAnswers = new Map(m.me.answers.map((a) => [a.slot, a]));
  const meTier = tierOf(m.me.rank);
  const meMarks = Object.fromEntries(
    SLOTS.map((s) => {
      const a = myAnswers.get(s);
      return [s, a ? (a.correct ? "solved" : "missed") : finished ? "missed" : null];
    }),
  ) as Record<Slot, Mark>;
  const me: Side = {
    you: true,
    username: m.me.username,
    avatar: avatarUrl(sb, m.me.avatar_path ?? null),
    rank: m.me.rank,
    tier: meTier,
    marked: meTier > 0,
    elo: m.me.elo_after ?? m.me.elo_before,
    place: places[m.me.username] ?? null,
    wins: m.me.wins ?? 0,
    losses: m.me.losses ?? 0,
    draws: m.me.draws ?? 0,
    score: m.me.score,
    marks: meMarks,
    statuses: SLOTS.map((s) => {
      const a = myAnswers.get(s);
      const text = a
        ? a.correct
          ? solvedText(a.answered_at)
          : a.answer === null
            ? "FORFEITED"
            : "MISSED"
        : finished
          ? "MISSED"
          : s === working
            ? "WORKING"
            : "—";
      return { slot: s, points: points(s), text, tone: a?.correct ? "on" : text === "—" ? "off" : "mid" };
    }),
    ghost: false,
  };

  const o = m.opponent;
  if (!o) return { me, opp: null };
  const oTier = tierOf(o.rank);
  // During play the server only says which slots they've solved: score them from that.
  const solvedPoints = o.solved.reduce((n, s) => n + points(s), 0);
  const opp: Side = {
    you: false,
    username: o.username,
    avatar: avatarUrl(sb, o.avatar_path ?? null),
    rank: o.rank,
    tier: oTier,
    marked: oTier > 0 && !o.is_ghost,
    elo: o.elo_after ?? o.elo_before,
    place: places[o.username] ?? null,
    wins: o.wins ?? 0,
    losses: o.losses ?? 0,
    draws: o.draws ?? 0,
    score: o.score ?? solvedPoints,
    marks: Object.fromEntries(SLOTS.map((s) => [s, o.solved.includes(s) ? "solved" : finished ? "missed" : null])) as Record<Slot, Mark>,
    statuses: SLOTS.map((s) => {
      const solved = o.solved.includes(s);
      const text = solved ? solvedText(o.solved_at?.[s]) : finished ? "MISSED" : "—";
      return { slot: s, points: points(s), text, tone: solved ? "on" : finished ? "mid" : "off" };
    }),
    ghost: o.is_ghost,
  };
  return { me, opp };
}

const markWord = (m: Mark) => (m === "solved" ? "solved" : m === "missed" ? "missed" : "open");
const toneClass = { on: "text-text", mid: "text-text-muted", off: "text-[#55524c]" } as const;

/** Picture or initial, with a rank-color ring when the side is marked. */
function Avatar({ side, size }: { side: Side; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center overflow-hidden rounded-full bg-text leading-none font-bold text-bg select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        boxShadow: side.marked ? `0 0 0 2px var(--surface), 0 0 0 3.5px var(--rank-${side.tier})` : undefined,
      }}
    >
      {side.avatar ? (
        // A user-uploaded file on Supabase Storage, already 256×256: next/image would only add a remote config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={side.avatar} alt="" className="size-full object-cover" />
      ) : (
        side.username.charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** Rank banner, picture, handle, badge, Elo and Global, then this duel: each problem's status and the points. Mirrored for the opponent. */
function PlayerCard({ side, max, flip, gone = null }: { side: Side; max: number; flip?: boolean; gone?: number | null }) {
  const nameColor = side.marked ? `var(--rank-${side.tier}-text)` : "var(--text)";
  const played = side.wins + side.losses + side.draws;
  const stats = [
    { k: "Elo", v: side.elo.toLocaleString("en-US") },
    { k: "Global", v: side.place === null ? "—" : `#${side.place.toLocaleString("en-US")}` },
  ];
  if (flip) stats.reverse();
  return (
    <div className="relative">
      <section
        aria-label={side.you ? `You, @${side.username}` : `Opponent, @${side.username}`}
        className={`flex flex-col gap-5 ${gone !== null ? "opacity-35" : ""}`}
      >
        <div className={`overflow-hidden rounded-(--radius-lg) border border-line bg-surface ${flip ? "text-right" : ""}`}>
          <div className="relative h-[84px]" aria-hidden="true">
            <Image src={`/images/banners/${BANNER_FILES[Math.max(1, side.tier) - 1]}.jpg`} alt="" fill sizes="240px" className="object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_40%,var(--surface)_100%)]" />
          </div>
          <div className={`relative -mt-[26px] flex flex-col px-4 pb-4 ${flip ? "items-end" : "items-start"}`}>
            <Avatar side={side} size={52} />
            <p className="mt-2.5 text-[17px] leading-6 font-semibold tracking-[-0.02em] break-all" style={{ color: nameColor }}>
              {side.username}
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-text-muted">{side.ghost ? "Recorded run" : side.you ? "You" : "Opponent"}</p>
            <div className={`mt-3 flex items-center gap-2 ${flip ? "flex-row-reverse" : ""}`}>
              {side.marked && <RankBadge rank={side.tier as Rank} size={22} decorative />}
              <span className="font-mono text-[11px] tracking-[0.12em] uppercase" style={{ color: side.marked ? `var(--rank-${side.tier}-text)` : "var(--text-muted)" }}>
                {side.tier ? side.rank : "Unranked"}
              </span>
            </div>
            <dl className="mt-2.5 flex gap-5 font-mono">
              {stats.map((s) => (
                <div key={s.k} className="flex flex-col-reverse">
                  <dt className="mt-0.5 text-[10px] tracking-[0.12em] text-[#6e6a62] uppercase">{s.k}</dt>
                  <dd className="text-[22px] leading-7 font-semibold tracking-[-0.03em] tabular-nums">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <ul aria-label="This duel" className="flex flex-col font-mono text-[12px]">
          {side.statuses.map((st) => (
            <li key={st.slot} className={`flex justify-between gap-3 border-t border-line py-2.5 ${flip ? "flex-row-reverse" : ""}`}>
              <span className={st.tone === "off" ? toneClass.off : "text-text"}>
                {st.slot} · {pts(st.points)}
              </span>
              <span className={toneClass[st.tone]}>{st.text}</span>
            </li>
          ))}
          <li className={`flex justify-between gap-3 border-t border-line py-2.5 ${flip ? "flex-row-reverse" : ""}`}>
            <span className="text-text-muted">POINTS</span>
            <span className="text-text tabular-nums">
              {side.score} / {max}
            </span>
          </li>
        </ul>

        {!side.you && played > 0 && (
          <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3.5 font-mono text-[11px] tracking-[0.06em] text-[#6e6a62]">
            <div className={flip ? "text-right" : ""}>
              <dt>WIN RATE</dt>
              <dd className="mt-1 text-[15px] text-text">{Math.round((100 * side.wins) / played)}%</dd>
            </div>
            <div className={flip ? "order-first" : "text-right"}>
              <dt>RECORD</dt>
              <dd className="mt-1 text-[15px] text-text tabular-nums">
                <span aria-hidden="true">
                  {side.wins}–{side.losses}–{side.draws}
                </span>
                <span className="sr-only">
                  {side.wins} wins, {side.losses} losses, {side.draws} draws
                </span>
              </dd>
            </div>
          </dl>
        )}
      </section>
      {gone !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <p className={`${mono} text-text`}>Disconnected</p>
          <p className="font-mono text-[22px] leading-7 font-semibold tracking-[-0.03em] text-text tabular-nums">{formatClock(gone)}</p>
        </div>
      )}
    </div>
  );
}

/** Phone: picture, handle, "4/6" and the A/B/C marks on one line per player. */
function CompactPlayer({ side, max, flip, gone }: { side: Side; max: number; flip?: boolean; gone?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${flip ? "flex-row-reverse text-right" : ""} ${gone ? "opacity-35" : ""}`}>
      <Avatar side={side} size={32} />
      <div className="min-w-0">
        <p
          className="truncate text-[15px] leading-5 font-semibold"
          style={{ color: side.marked ? `var(--rank-${side.tier}-text)` : "var(--text)" }}
        >
          <span className="sr-only">{side.you ? "You, " : "Opponent, "}</span>
          {side.username}
        </p>
        <p className={`flex items-baseline gap-2 font-mono ${flip ? "flex-row-reverse" : ""}`}>
          <span className="text-[15px] leading-6 font-semibold tabular-nums">
            {side.score}/{max}
            <span className="sr-only"> points</span>
          </span>
          <span className="flex gap-1 text-[12px]">
            {SLOTS.map((s) => {
              const m = side.marks[s];
              return (
                <span key={s} className={m === "solved" ? "text-text" : "text-text-muted"}>
                  <span aria-hidden="true">{m === "solved" ? "✓" : m === "missed" ? "✗" : s}</span>
                  <span className="sr-only">
                    {s} {markWord(m)}
                  </span>
                </span>
              );
            })}
          </span>
        </p>
        {side.ghost && <p className="truncate text-[12px] leading-4 text-text-muted">Recorded run</p>}
      </div>
    </div>
  );
}

// ── Clock ───────────────────────────────────────────────────────────

const reducedQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(reducedQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

function Clock({ ms, size }: { ms: number; size: "lg" | "sm" }) {
  const low = ms < LOW_TIME_MS;
  return (
    <p
      role="timer"
      aria-label={`Time left ${formatClock(ms)}`}
      className={`font-mono leading-none font-medium tracking-[-0.04em] tabular-nums ${low ? "text-accent-text" : "text-text"} ${
        size === "lg" ? "text-[64px]" : "text-[40px]"
      }`}
    >
      {formatClock(ms)}
    </p>
  );
}

/** Drains left to right: the filled part keeps to the right and shrinks. Steps once a second with reduced motion. */
function TimeBar({ left, total }: { left: number; total: number }) {
  const reduced = useReducedMotion();
  const shown = reduced ? Math.ceil(Math.max(0, left) / 1000) * 1000 : Math.max(0, left);
  const pct = Math.min(100, (100 * shown) / total);
  return (
    <div aria-hidden="true" className="flex h-0.5 w-full justify-end overflow-hidden rounded-full bg-surface-raised">
      <span
        className={`h-full rounded-full ${left < LOW_TIME_MS ? "bg-accent" : "bg-text"} ${reduced ? "" : "transition-[width] duration-300 ease-linear"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Waiting for a friend ────────────────────────────────────────────

function Waiting({ code }: { code: string | null }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function copy(what: "link" | "code", text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (timer.current) clearTimeout(timer.current);
        setCopied(what);
        timer.current = setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => {});
  }

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-[1_0_auto] flex-col items-center justify-center px-5 py-24 text-center">
      <h1 className="text-[clamp(36px,5vw,56px)] leading-[1] font-extrabold tracking-[-0.03em]">Waiting for your friend.</h1>
      <p className="mt-4 text-[19px] leading-[29px] text-ink-muted">Send them the link, or the code to enter on /play.</p>
      {code && (
        <>
          <p
            aria-label={`Invite code ${code.split("").join(" ")}`}
            className="mt-10 pl-[0.2em] text-[clamp(48px,12vw,88px)] leading-none font-extrabold tracking-[0.2em] tabular-nums"
          >
            {code}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6">
            <button type="button" onClick={() => copy("link", `${window.location.origin}/join/${code}`)} className={quiet}>
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button type="button" onClick={() => copy("code", code)} className={quiet}>
              {copied === "code" ? "Code copied" : "Copy code"}
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            {copied ? `${copied === "link" ? "Link" : "Code"} copied` : ""}
          </p>
        </>
      )}
      <Link href="/play" className={`${secondary} mt-10`}>
        Back to lobby
      </Link>
    </main>
  );
}

// ── Results ─────────────────────────────────────────────────────────

const WORDS = ["none", "one", "two", "three", "four", "five", "six"];
const word = (n: number) => WORDS[n] ?? String(n);

/** "Victory, by two problems to one." Winner's count first; points or time when problems are level. */
function headline(result: MatchState["me"]["result"], mine: { solved: number; score: number }, theirs: { solved: number; score: number }) {
  if (result === "draw" || result === null) return "Draw.";
  const [w, l] = result === "win" ? [mine, theirs] : [theirs, mine];
  const lead = result === "win" ? "Victory" : "Defeat";
  if (w.solved > l.solved) {
    return result === "win"
      ? `${lead}, by ${word(w.solved)} ${w.solved === 1 ? "problem" : "problems"} to ${word(l.solved)}.`
      : `${lead}, ${word(w.solved)} to ${word(l.solved)}.`;
  }
  if (w.score > l.score) return `${lead}, by ${word(w.score)} points to ${word(l.score)}.`;
  return `${lead}, on time.`;
}

function Results({ match, matchId, points, width }: { match: MatchState; matchId: string; points: (s: Slot) => number; width: string }) {
  const sb = useRef(createClient()).current;
  const formId = useId();
  // Question reports live on each question (QuestionReport); this form reports the opponent only.
  const [playerReported, setPlayerReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const me = match.me;
  const opp = match.opponent;
  const eloChange = me.elo_after !== null ? me.elo_after - me.elo_before : 0;
  const forfeitNote = !match.forfeited_by
    ? null
    : match.forfeited_by === me.user_id
      ? match.resigned ? "You forfeited." : "You disconnected."
      : match.resigned ? "Your opponent forfeited." : "Your opponent disconnected.";
  const mySolved = me.answers.filter((a) => a.correct).length;
  const isVoid = match.status === "void";
  const title = isVoid ? "No result." : headline(
    me.result,
    { solved: mySolved, score: me.score },
    { solved: opp?.solved.length ?? 0, score: opp?.score ?? 0 },
  );

  async function sendReport(e: React.FormEvent) {
    e.preventDefault();
    const text = reason.trim();
    if (!text || reportPending) return;
    setReportPending(true);
    setReportError(null);
    try {
      await api.reportPlayer(sb, matchId, text);
      setPlayerReported(true);
      setReporting(false);
      setReason("");
    } catch {
      setReportError("Couldn't send your report. Please try again.");
    } finally {
      setReportPending(false);
    }
  }

  return (
    <div className={`${card} flex w-full ${width} flex-col px-6 py-10 md:px-8`}>
      <div className="flex flex-col items-center gap-3 text-center">
        <p className={`${mono} text-[#6e6a62]`}>
          {isVoid ? "Duel void" : <>Duel complete · <span className="tabular-nums">{me.score} – {opp?.score ?? 0}</span></>}
        </p>
        <h2 className="text-[clamp(28px,4vw,40px)] leading-[1.1] font-semibold tracking-[-0.04em]">{title}</h2>
        <p className="font-mono text-[20px] tabular-nums">
          {match.mode === "friend" ? (
            <span className="text-[15px] text-text-muted">Unrated.</span>
          ) : eloChange > 0 ? (
            <span className="text-[var(--rank-2-text)]">
              +{eloChange}
              <span className="sr-only"> Elo</span> · {(me.elo_after ?? me.elo_before).toLocaleString("en-US")}
            </span>
          ) : (
            <span className="text-text-muted">
              {eloChange < 0 ? `−${-eloChange}` : "±0"}
              <span className="sr-only"> Elo</span> · {(me.elo_after ?? me.elo_before).toLocaleString("en-US")}
            </span>
          )}
        </p>
        <p className={caption}>
          {opp ? `Against @${opp.username}` : "No opponent"}
          {opp?.is_ghost ? ", a recorded run" : ""}.{forfeitNote ? ` ${forfeitNote}` : ""}
          {isVoid ? " Nobody answered before time ran out, so it doesn't count." : ""}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2.5">
          <Link href="/play" className={primary}>
            Queue again
          </Link>
          <Link href="/play" className={secondary}>
            Lobby
          </Link>
        </div>
      </div>

      <table className="mt-10 w-full border-collapse text-left tabular-nums">
        <caption className="sr-only">Your answers</caption>
        <thead>
          <tr className="border-y border-rule text-[13px] text-ink-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">
              №
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              You
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Answer
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">
              Pts
            </th>
            <th scope="col" className="w-8 py-2 text-right font-semibold">
              <span className="sr-only">Result</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {match.questions.map((q) => {
            const a = me.answers.find((x) => x.slot === q.slot);
            const right = !!a?.correct;
            return (
              <tr key={q.slot} className="border-b border-hairline align-baseline">
                <th scope="row" className="py-3 pr-3 font-semibold">
                  {q.slot}
                  <span className="block text-[13px] leading-[18px] font-normal text-ink-muted">{q.topic}</span>
                </th>
                <td className={`py-3 pr-3 ${right ? "" : "text-ink-muted"}`}>{!a ? "—" : a.answer === null ? "Forfeited" : a.answer}</td>
                <td className="py-3 pr-3 font-semibold">{q.answer}</td>
                <td className="py-3 pr-3 text-right">
                  {right ? q.points : 0}/{points(q.slot)}
                </td>
                <td className="py-3 text-right">
                  {right ? (
                    <span className="font-semibold text-text">
                      <span aria-hidden="true">✓</span>
                      <span className="sr-only">Correct</span>
                    </span>
                  ) : (
                    <span className="text-ink-muted">
                      <span aria-hidden="true">✗</span>
                      <span className="sr-only">{a ? "Wrong" : "Not answered"}</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-6 flex flex-col">
        {match.questions.map((q) => (
          <details key={q.slot} className="group border-b border-hairline">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-2 text-[15px] font-semibold text-ink-muted hover:text-ink">
              <span>
                № {q.slot}: problem and proof
              </span>
              <span aria-hidden="true" className="group-open:rotate-90 motion-safe:transition-transform">
                →
              </span>
            </summary>
            <div className="pb-6">
              <QuestionReport matchId={matchId} slot={q.slot} />
              <p className="text-[19px] leading-[29px] whitespace-pre-wrap">{q.prompt}</p>
              {q.solution && (
                <p className="mt-4 text-ink-muted whitespace-pre-wrap">
                  {q.solution} <span className="text-accent-text">∎</span>
                </p>
              )}
            </div>
          </details>
        ))}
      </div>

      {opp && !opp.is_ghost && (reporting ? (
        <form onSubmit={sendReport} className="mt-8 flex flex-col gap-3 border-t border-hairline pt-6">
          <label htmlFor={`${formId}-reason`} className="text-[15px] font-semibold">
            What did @{opp.username} do?
          </label>
          <textarea
            id={`${formId}-reason`}
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-(--radius-md) border border-line bg-bg px-4 py-3 text-text"
          />
          {reportError && <p role="alert" className={caption}>{reportError}</p>}
          <div className="flex gap-2">
            <button disabled={!reason.trim() || reportPending} className={`${secondary} disabled:opacity-40`}>
              {reportPending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReporting(false);
                setReason("");
                setReportError(null);
              }}
              className={quiet}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-8 flex flex-wrap gap-x-6 border-t border-hairline pt-4">
          {playerReported ? (
            <p className={`${quiet} cursor-default`} role="status">Player reported. Thanks. We read every report.</p>
          ) : (
            <button type="button" onClick={() => setReporting(true)} className={quiet}>
              Report @{opp.username}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
