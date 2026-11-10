"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api, avatarUrl, friendlyError, TIER_NAMES, type Banner, type MatchState, type Slot } from "@/lib/erudent";
import QuestionCanvas from "@/components/QuestionCanvas";
import { BannerArt, Picture, RankTag, hue } from "@/components/ProfileBanner";
import { caption, primary, quiet, secondary, sheet } from "@/components/ui";

const POLL_MS = 1500;
const HEARTBEAT_MS = 5000;
const SLOTS: Slot[] = ["A", "B", "C"];
/** Points per slot before the questions arrive (countdown). get_match's own points win once they do. */
const DEFAULT_POINTS: Record<Slot, number> = { A: 1, B: 2, C: 3 };
const LOW_TIME_MS = 30_000;

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const pts = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

/** Duel screen: header and footer come from the server page and are hidden while the clock runs. */
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

  // ── Render ────────────────────────────────────────────────────────

  const page = (content: ReactNode, chrome = true) => (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      {chrome && header}
      {content}
      {chrome && footer}
    </div>
  );

  if (loadError || !match) {
    return page(
      <main className="mx-auto flex w-full max-w-[640px] flex-[1_0_auto] flex-col items-center justify-center gap-6 px-5 py-24 text-center">
        {loadError ? (
          <p role="alert" className="text-[19px] leading-[29px]">
            {loadError}
          </p>
        ) : (
          <p aria-busy="true" className="text-ink-muted">
            Loading the duel…
          </p>
        )}
        <Link href="/play" className={secondary}>
          Back to lobby
        </Link>
      </main>,
    );
  }

  if (phase === "waiting") return page(<Waiting code={match.invite_code} />);

  const points = (s: Slot) => match.questions.find((q) => q.slot === s)?.points ?? DEFAULT_POINTS[s];
  const maxPoints = SLOTS.reduce((n, s) => n + points(s), 0);
  const finished = phase === "finished";
  const sides = buildSides(sb, match, points, finished);
  const modeCaption = match.mode === "friend" ? "Friend match · unranked" : match.mode === "async" ? "Ranked · vs a recorded run" : "Ranked";

  // Three columns on lg: you · the problems · the opponent. Below lg, one compact row of both.
  const layout = (middle: ReactNode, center: ReactNode, chrome: boolean) =>
    page(
      <main className={`mx-auto w-full max-w-[1600px] flex-[1_0_auto] px-[clamp(16px,3vw,48px)] ${chrome ? "pt-4 pb-24 lg:pt-8" : "py-4 lg:py-8"}`}>
        <h1 className="sr-only">
          Duel: @{match.me.username} against {match.opponent ? `@${match.opponent.username}` : "an opponent"}
        </h1>
        <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-hairline pb-4 lg:hidden">
          <CompactPlayer side={sides.me} max={maxPoints} />
          <div className="flex justify-center">{center}</div>
          {sides.opp ? <CompactPlayer side={sides.opp} max={maxPoints} flip /> : <span />}
        </div>
        <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-8 xl:gap-x-12">
          <div className="hidden lg:col-span-3 lg:block">
            <PlayerCard side={sides.me} max={maxPoints} />
          </div>
          <div className="min-w-0 lg:col-span-6">{middle}</div>
          <div className="hidden lg:col-span-3 lg:block">{sides.opp ? <PlayerCard side={sides.opp} max={maxPoints} flip /> : null}</div>
        </div>
      </main>,
      chrome,
    );

  if (finished) {
    return layout(<Results match={match} matchId={matchId} points={points} />, <span className="text-[13px] font-semibold text-ink-muted">Final</span>, true);
  }

  if (phase === "countdown") {
    const n = Math.max(1, Math.ceil((startsAt! - serverNow) / 1000));
    return layout(
      <section aria-label="Starting" className="flex flex-col items-center py-8 text-center lg:py-16">
        <p className={`${caption} font-semibold`}>{modeCaption}</p>
        <p
          aria-live="polite"
          className="mt-4 text-[clamp(120px,22vw,240px)] leading-[0.85] font-extrabold tracking-[-0.04em] tabular-nums"
        >
          {n}
        </p>
        <p className="mt-6 text-[19px] leading-[29px] text-ink-muted">Three problems. Five minutes. One try each.</p>
        {focusMode && (
          <div className="mt-10 flex max-w-[440px] flex-col items-center gap-5 border-t border-hairline pt-8">
            <p className="text-[15px] leading-[22px] text-ink-muted">
              <span className="font-semibold text-ink">Focus mode is on.</span> Leaving this tab once is a warning. The second time, you lose the
              problem on screen.
            </p>
            <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className={secondary}>
              Go fullscreen
            </button>
          </div>
        )}
      </section>,
      <span className="text-[15px] font-semibold text-ink-muted">vs</span>,
      true,
    );
  }

  // ── Live ──
  const left = endsAt! - serverNow;
  const total = Math.max(1, endsAt! - startsAt!);
  const question = match.questions.find((q) => q.slot === slot);
  const mine = answered.get(slot);

  return layout(
    <div className="flex flex-col gap-5">
      <div className="hidden justify-center lg:flex">
        <Clock ms={left} size="lg" />
      </div>
      <TimeBar left={left} total={total} />

      <div role="tablist" aria-label="Problems" className="grid grid-cols-3 gap-1 rounded-(--r-md) border border-hairline p-1">
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
              className={`flex min-h-14 items-center justify-between gap-2 rounded-(--r-sm) px-3 py-2 text-left sm:px-4 ${
                current ? "bg-sunken text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              <span className="flex min-w-0 flex-col">
                <span className={`text-[19px] leading-6 ${current ? "font-extrabold" : "font-semibold"}`}>{q.slot}</span>
                <span className="text-[13px] leading-[18px] tabular-nums">{pts(q.points)}</span>
              </span>
              <Glyph mark={mark} you />
            </button>
          );
        })}
      </div>

      {question && (
        <section id="problem-sheet" role="tabpanel" aria-labelledby={`tab-${question.slot}`} className={sheet}>
          <p className="text-[13px] leading-[18px] font-semibold text-ink-muted tabular-nums">
            № {question.slot} · {pts(question.points)} · {question.topic}
          </p>
          <div className="mt-6">
            {focusMode ? (
              <QuestionCanvas text={question.prompt} />
            ) : (
              <p className="text-[21px] leading-[31px] whitespace-pre-wrap">{question.prompt}</p>
            )}
          </div>

          <div className="mt-auto pt-8">
            {mine ? (
              <p className="text-[19px] leading-[29px] font-semibold">
                {mine.answer === null ? (
                  <span className="text-ink-muted"><span className="mr-2">✗</span>Forfeited.</span>
                ) : mine.correct ? (
                  <>
                    <span className="mr-2 text-pencil">✓</span>You answered <span className="tabular-nums">{mine.answer}</span>. Correct.
                  </>
                ) : (
                  <span className="text-ink-muted">
                    <span className="mr-2">✗</span>You answered <span className="tabular-nums">{mine.answer}</span>. Wrong.
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
                  placeholder="12 or 3/4"
                  className="h-14 w-full min-w-0 rounded-(--r-md) border border-hairline bg-sunken px-4 text-[19px] text-ink tabular-nums placeholder:text-ink-muted"
                />
                <button disabled={submitting || !input.trim()} className={primary}>
                  Submit
                </button>
              </form>
            )}
            {notice && (
              <p role="status" className="mt-4 text-[15px] leading-[22px]">
                {notice}
              </p>
            )}
            <p className={`${caption} mt-4`}>One try per problem. All or nothing.</p>
          </div>
        </section>
      )}
    </div>,
    <Clock ms={left} size="sm" />,
    false,
  );
}

// ── Sides ───────────────────────────────────────────────────────────

type Mark = "solved" | "missed" | null;

type Side = {
  you: boolean;
  username: string;
  avatar: string | null;
  banner: Banner;
  color: string;
  rank: string;
  tier: number;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  marks: Record<Slot, Mark>;
  ghost: boolean;
};

function buildSides(sb: ReturnType<typeof createClient>, m: MatchState, points: (s: Slot) => number, finished: boolean) {
  const tierOf = (rank: string) => TIER_NAMES.indexOf(rank as (typeof TIER_NAMES)[number]) + 1;
  const myAnswers = new Map(m.me.answers.map((a) => [a.slot, a]));
  const meTier = tierOf(m.me.rank);
  const me: Side = {
    you: true,
    username: m.me.username,
    avatar: avatarUrl(sb, m.me.avatar_path ?? null),
    banner: m.me.banner ?? "grid",
    color: hue(m.me.accent || meTier),
    rank: m.me.rank,
    tier: meTier,
    elo: m.me.elo_after ?? m.me.elo_before,
    wins: m.me.wins ?? 0,
    losses: m.me.losses ?? 0,
    draws: m.me.draws ?? 0,
    score: m.me.score,
    marks: Object.fromEntries(
      SLOTS.map((s) => {
        const a = myAnswers.get(s);
        return [s, a ? (a.correct ? "solved" : "missed") : finished ? "missed" : null];
      }),
    ) as Record<Slot, Mark>,
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
    banner: o.banner ?? "grid",
    color: hue(o.accent || oTier),
    rank: o.rank,
    tier: oTier,
    elo: o.elo_after ?? o.elo_before,
    wins: o.wins ?? 0,
    losses: o.losses ?? 0,
    draws: o.draws ?? 0,
    score: o.score ?? solvedPoints,
    marks: Object.fromEntries(SLOTS.map((s) => [s, o.solved.includes(s) ? "solved" : finished ? "missed" : null])) as Record<Slot, Mark>,
    ghost: o.is_ghost,
  };
  return { me, opp };
}

/** ✓ solved (pencil for you, ink for them), ✗ missed (muted), or nothing yet. */
function Glyph({ mark, you }: { mark: Mark; you: boolean }) {
  if (mark === "solved")
    return (
      <span aria-label="solved" className={`text-[17px] font-extrabold ${you ? "text-pencil" : "text-ink"}`}>
        ✓
      </span>
    );
  if (mark === "missed")
    return (
      <span aria-label="missed" className="text-[17px] text-ink-muted">
        ✗
      </span>
    );
  return null;
}

const markWord = (m: Mark) => (m === "solved" ? "solved" : m === "missed" ? "missed" : "open");

/** A · B · C as hairline cells: the letter, then ✓ or ✗ once decided. */
function Marks({ side, flip }: { side: Side; flip?: boolean }) {
  return (
    <ul aria-label="Problems" className={`flex gap-2 ${flip ? "justify-end" : ""}`}>
      {SLOTS.map((s) => {
        const m = side.marks[s];
        return (
          <li
            key={s}
            className={`flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-(--r-sm) border px-2.5 text-[15px] ${
              m === "solved" ? "border-rule font-semibold text-ink" : "border-hairline text-ink-muted"
            }`}
          >
            <span aria-hidden="true">{s}</span>
            {m && (
              <span aria-hidden="true" className={m === "solved" ? `font-extrabold ${side.you ? "text-pencil" : "text-ink"}` : ""}>
                {m === "solved" ? "✓" : "✗"}
              </span>
            )}
            <span className="sr-only">
              {s} {markWord(m)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One segment per point. Filled in the player's accent; the track is hairline. */
function PointsBar({ score, max, color, flip }: { score: number; max: number; color: string; flip?: boolean }) {
  return (
    <div aria-hidden="true" className={`flex gap-1 ${flip ? "flex-row-reverse" : ""}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2 flex-1 rounded-full" style={{ background: i < score ? color : "var(--hairline)" }} />
      ))}
    </div>
  );
}

function WinLoss({ side }: { side: Side }) {
  return (
    <span className="tabular-nums">
      <span aria-hidden="true">
        {side.wins}W · {side.losses}L · {side.draws}D
      </span>
      <span className="sr-only">
        {side.wins} wins, {side.losses} losses, {side.draws} draws
      </span>
    </span>
  );
}

/** A compact ProfileBanner plus this duel's score and marks. The opponent's card is mirrored. */
function PlayerCard({ side, max, flip }: { side: Side; max: number; flip?: boolean }) {
  const placement = side.tier === 0;
  return (
    <section
      aria-label={side.you ? `You, @${side.username}` : `Opponent, @${side.username}`}
      className={`overflow-hidden rounded-(--r-md) border border-hairline bg-surface ${flip ? "text-right" : ""}`}
    >
      <div className="h-[72px]" aria-hidden="true">
        <BannerArt banner={side.banner} color={side.color} />
      </div>
      <div className={`flex flex-col px-5 pb-5 ${flip ? "items-end" : "items-start"}`}>
        <span className="-mt-8 flex">
          <Picture username={side.username} url={side.avatar} size={56} />
        </span>
        <p className="mt-2 text-[19px] leading-6 font-extrabold break-all">@{side.username}</p>
        <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${flip ? "justify-end" : ""}`}>
          <RankTag rank={placement ? "Placement" : side.rank} tier={side.tier} />
          {!placement && (
            <span className="text-[15px] font-semibold tabular-nums">
              {side.elo.toLocaleString("en-US")} <span className="font-normal text-ink-muted">Elo</span>
            </span>
          )}
        </div>
        <p className={`${caption} mt-2`}>
          <WinLoss side={side} />
        </p>
      </div>

      <div className={`flex flex-col gap-4 border-t border-hairline px-5 py-5 ${flip ? "items-end" : "items-start"}`}>
        <p className="text-[13px] leading-[18px] font-semibold text-ink-muted">This duel</p>
        <p className="-mt-2 flex items-baseline gap-2 tabular-nums">
          <span className="text-[44px] leading-none font-extrabold tracking-[-0.03em]">{side.score}</span>
          <span className="text-[17px] font-semibold text-ink-muted">/ {max} pts</span>
        </p>
        <div className="w-full">
          <PointsBar score={side.score} max={max} color={side.color} flip={flip} />
        </div>
        <Marks side={side} flip={flip} />
        {side.ghost && <p className={caption}>Recorded run</p>}
      </div>
    </section>
  );
}

/** Phone: avatar, @username, "4/6" and the A/B/C glyphs on one line per player. */
function CompactPlayer({ side, max, flip }: { side: Side; max: number; flip?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${flip ? "flex-row-reverse text-right" : ""}`}>
      <Picture username={side.username} url={side.avatar} size={32} ring={false} />
      <div className="min-w-0">
        <p className="truncate text-[15px] leading-5 font-semibold">
          <span className="sr-only">{side.you ? "You, " : "Opponent, "}</span>@{side.username}
        </p>
        <p className={`flex items-baseline gap-2 ${flip ? "flex-row-reverse" : ""}`}>
          <span className="text-[17px] leading-6 font-extrabold tabular-nums">
            {side.score}/{max}
            <span className="sr-only"> points</span>
          </span>
          <span className="flex gap-1 text-[13px]">
            {SLOTS.map((s) => {
              const m = side.marks[s];
              return (
                <span
                  key={s}
                  className={m === "solved" ? `font-extrabold ${side.you ? "text-pencil" : "text-ink"}` : "text-ink-muted"}
                >
                  <span aria-hidden="true">{m === "solved" ? "✓" : m === "missed" ? "✗" : s}</span>
                  <span className="sr-only">
                    {s} {markWord(m)}
                  </span>
                </span>
              );
            })}
          </span>
        </p>
        {side.ghost && <p className="truncate text-[13px] leading-[18px] text-ink-muted">Recorded run</p>}
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
      className={`font-extrabold tabular-nums ${low ? "text-pencil" : "text-ink"} ${
        size === "lg" ? "text-[64px] leading-none tracking-[-0.03em]" : "text-[28px] leading-none tracking-[-0.02em]"
      }`}
    >
      {formatClock(ms)}
    </p>
  );
}

/** Drains left to right: the ink part keeps to the right and shrinks. Steps once a second with reduced motion. */
function TimeBar({ left, total }: { left: number; total: number }) {
  const reduced = useReducedMotion();
  const shown = reduced ? Math.ceil(Math.max(0, left) / 1000) * 1000 : Math.max(0, left);
  const pct = Math.min(100, (100 * shown) / total);
  return (
    <div aria-hidden="true" className="flex h-1.5 w-full justify-end overflow-hidden rounded-full bg-hairline">
      <span
        className={`h-full rounded-full ${left < LOW_TIME_MS ? "bg-pencil" : "bg-ink"} ${reduced ? "" : "transition-[width] duration-300 ease-linear"}`}
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

function Results({ match, matchId, points }: { match: MatchState; matchId: string; points: (s: Slot) => number }) {
  const sb = useRef(createClient()).current;
  const formId = useId();
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<"problem" | "player" | null>(null);
  const [reportSlot, setReportSlot] = useState<Slot>("A");
  const [reason, setReason] = useState("");
  const me = match.me;
  const opp = match.opponent;
  const eloChange = me.elo_after !== null ? me.elo_after - me.elo_before : 0;
  const forfeitNote =
    match.forfeited_by ? (match.forfeited_by === me.user_id ? "You disconnected." : "Your opponent disconnected.") : null;
  const mySolved = me.answers.filter((a) => a.correct).length;
  const title = headline(
    me.result,
    { solved: mySolved, score: me.score },
    { solved: opp?.solved.length ?? 0, score: opp?.score ?? 0 },
  );

  function sendReport(e: React.FormEvent) {
    e.preventDefault();
    const text = reason.trim();
    if (!text || !reporting) return;
    if (reporting === "problem") {
      api.reportQuestion(sb, matchId, reportSlot, text).catch(() => {});
      setReported((s) => new Set(s).add(reportSlot));
    } else {
      api.reportPlayer(sb, matchId, text).catch(() => {});
      setReported((s) => new Set(s).add("player"));
    }
    setReporting(null);
    setReason("");
  }

  const openSlots = SLOTS.filter((s) => !reported.has(s));

  return (
    <div className="flex flex-col py-4 lg:py-8">
      <h2 className="text-[clamp(36px,5vw,56px)] leading-[1] font-extrabold tracking-[-0.03em]">{title}</h2>
      <p className="mt-4 text-[28px] leading-[32px] font-extrabold tracking-[-0.02em] tabular-nums">
        {match.mode === "friend" ? (
          <span className="text-[19px] font-normal tracking-normal text-ink-muted">Unrated.</span>
        ) : eloChange > 0 ? (
          <span className="text-pencil">
            +{eloChange}
            <span className="sr-only"> Elo</span> ∎
          </span>
        ) : (
          <span className="text-ink-muted">
            {eloChange < 0 ? `−${-eloChange}` : "±0"}
            <span className="sr-only"> Elo</span>
          </span>
        )}
      </p>
      <p className={`${caption} mt-2`}>
        {me.score} to {opp?.score ?? 0} points
        {opp ? ` against @${opp.username}` : ""}
        {opp?.is_ghost ? ", a recorded run" : ""}.{forfeitNote ? ` ${forfeitNote}` : ""}
      </p>

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
                    <span className="font-extrabold text-pencil">
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
              <p className="text-[19px] leading-[29px] whitespace-pre-wrap">{q.prompt}</p>
              {q.solution && (
                <p className="mt-4 text-ink-muted whitespace-pre-wrap">
                  {q.solution} <span className="text-pencil">∎</span>
                </p>
              )}
            </div>
          </details>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link href="/play" className={primary}>
          Play again
        </Link>
        <Link href="/play" className={`${secondary} h-14`}>
          Back to lobby
        </Link>
      </div>

      {reporting ? (
        <form onSubmit={sendReport} className="mt-8 flex flex-col gap-3 border-t border-hairline pt-6">
          {reporting === "problem" ? (
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <legend className="mb-2 text-[15px] font-semibold">Which problem?</legend>
              {openSlots.map((s) => (
                <label key={s} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
                  <input type="radio" name={`${formId}-slot`} checked={reportSlot === s} onChange={() => setReportSlot(s)} className="accent-ink" />
                  № {s}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label htmlFor={`${formId}-reason`} className="text-[15px] font-semibold">
            {reporting === "problem" ? "What's wrong with it?" : `What did @${opp?.username} do?`}
          </label>
          <textarea
            id={`${formId}-reason`}
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-(--r-md) border border-hairline bg-sunken px-4 py-3 text-ink"
          />
          <div className="flex gap-2">
            <button disabled={!reason.trim()} className={`${secondary} disabled:opacity-40`}>
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setReporting(null);
                setReason("");
              }}
              className={quiet}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-8 flex flex-wrap gap-x-6 border-t border-hairline pt-4">
          {openSlots.length ? (
            <button
              type="button"
              onClick={() => {
                setReportSlot(openSlots[0]);
                setReporting("problem");
              }}
              className={quiet}
            >
              Report problem
            </button>
          ) : (
            <p className={`${quiet} cursor-default`}>Problems reported.</p>
          )}
          {opp && !opp.is_ghost &&
            (reported.has("player") ? (
              <p className={`${quiet} cursor-default`}>Player reported.</p>
            ) : (
              <button type="button" onClick={() => setReporting("player")} className={quiet}>
                Report @{opp.username}
              </button>
            ))}
          {reported.size > 0 && <p className={`${caption} w-full`}>Thanks. We read every report.</p>}
        </div>
      )}
    </div>
  );
}
