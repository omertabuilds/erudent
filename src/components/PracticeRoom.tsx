"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError, tierName, TIER_NAMES, type PracticeQuestion, type PracticeStats } from "@/lib/erudent";
import RankBadge, { type Rank } from "@/components/RankBadge";
import { ScratchPad } from "@/components/Workspace";

/**
 * What the server revealed after an answer or a skip. `yours` is null for a skip.
 * `no` is the problem's number, `next` the tier auto moved to (null if it stayed).
 */
type Revealed = {
  questionId: string;
  correct: boolean;
  answer: string;
  solution: string;
  yours: string | null;
  no: number;
  next: { tier: number; up: boolean } | null;
};

/**
 * Auto, or one fixed tier. `tier` is where the next question comes from.
 * Auto stays inside min..max; `progress` is 0–1 toward the next tier (null on a fixed tier or before loading).
 */
type Setting = { auto: boolean; tier: number | null; min: number; max: number; progress: number | null };
type Range = { min: number; max: number };

export default function PracticeRoom() {
  const sb = useRef(createClient()).current;
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [emptyTier, setEmptyTier] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<string | null>(null); // question id with the report form open
  const [reason, setReason] = useState("");
  const [scratch, setScratch] = useState(""); // private, cleared with each new problem
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingId = useRef<string | null>(null); // question on screen, not yet answered

  const refreshStats = useCallback(() => api.practiceStats(sb).then(setStats).catch(() => {}), [sb]);

  // Ask for a question. The server hands back the unanswered one if there is one,
  // so a tier change only takes effect once it's answered or skipped.
  const load = useCallback(
    async (tier: number | null, changingTier = false, range: Range | null = null) => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        const q = await api.nextPracticeQuestion(sb, tier, range);
        setEmptyTier(null);
        setSetting({ auto: q.auto, tier: q.selected_tier, min: q.min_tier, max: q.max_tier, progress: q.progress });
        setQuestion(q);
        if (q.question_id === pendingId.current) {
          if (changingTier) {
            const label = q.auto ? `Auto (${rangeLabel(q.min_tier, q.max_tier)})` : tierName(q.selected_tier);
            setNotice(`${label} starts with the next question. Skip to switch now.`);
          }
        } else {
          pendingId.current = q.question_id;
          setRevealed(null);
          setInput("");
          setScratch("");
        }
      } catch (e) {
        const empty = (e instanceof Error ? e.message : String(e)).match(/no_questions_for_tier (\d)/);
        if (empty) {
          setEmptyTier(Number(empty[1]));
          setQuestion(null);
          setRevealed(null);
          pendingId.current = null;
        } else {
          setError(friendlyError(e));
        }
      } finally {
        setBusy(false);
      }
    },
    [sb],
  );

  // Carry on in the mode you left practice in.
  useEffect(() => {
    api
      .practiceStats(sb)
      .then((s) => {
        setStats(s);
        setSetting({ auto: s.auto, tier: s.tier, min: s.min_tier, max: s.max_tier, progress: null });
        return load(s.auto ? null : s.tier);
      })
      .catch((e) => setError(friendlyError(e)));
  }, [sb, load]);

  const next = useCallback(() => {
    if (!busy) load(setting && !setting.auto ? setting.tier : null);
  }, [busy, load, setting]);

  // New question on screen: put the cursor in the answer box.
  useEffect(() => {
    if (question && !revealed) inputRef.current?.focus();
  }, [question, revealed]);

  // After the result, Enter anywhere loads the next question. Buttons and links keep their own Enter.
  useEffect(() => {
    if (!revealed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest("button, a, input, textarea, select")) return;
      e.preventDefault();
      next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, next]);

  function show(r: Awaited<ReturnType<typeof api.submitPracticeAnswer>>, yours: string | null) {
    if (r.status === "invalid_format") return setNotice("Answer with an integer or a fraction like 3/4. No decimals.");
    if (r.status === "no_question") return setNotice(friendlyError("no_question"));
    const prev = setting?.tier ?? null;
    const moved = !!setting?.auto && prev !== null && r.tier !== prev;
    setRevealed({
      questionId: pendingId.current!,
      correct: r.correct,
      answer: r.answer,
      solution: r.solution,
      yours,
      no: (stats?.attempted ?? 0) + 1,
      next: moved ? { tier: r.tier, up: r.tier > prev } : null,
    });
    pendingId.current = null;
    setSetting((s) => (s ? { ...s, tier: r.tier, progress: r.progress } : s)); // auto may have moved
    refreshStats();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (revealed) return next();
    if (!input.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      show(await api.submitPracticeAnswer(sb, input), input.trim());
    } catch (err) {
      setNotice(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      show(await api.skipPracticeQuestion(sb), null);
    } catch (err) {
      setNotice(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function pickTier(tier: number | null) {
    if (busy || !setting) return;
    if (tier === null ? setting.auto : !setting.auto && setting.tier === tier) return;
    load(tier, true);
  }

  // Auto range. Moving one end past the other drags it along.
  function pickRange(end: "min" | "max", t: number) {
    if (busy || !setting) return;
    const min = end === "min" ? t : Math.min(setting.min, t);
    const max = end === "max" ? t : Math.max(setting.max, t);
    if (setting.auto && min === setting.min && max === setting.max) return;
    load(null, true, { min, max });
  }


  function sendReport(e: React.FormEvent, questionId: string) {
    e.preventDefault();
    const text = reason.trim();
    if (!text) return;
    api.reportPracticeQuestion(sb, questionId, text).catch(() => {});
    setReported((s) => new Set(s).add(questionId));
    setReporting(null);
    setReason("");
  }

  const suggestion = emptyTier ? (emptyTier > 1 ? emptyTier - 1 : 2) : null;
  const attempted = stats?.attempted ?? 0;
  const accuracy = attempted ? Math.round((100 * (stats?.correct ?? 0)) / attempted) : null;
  const byTier = [...(stats?.by_tier ?? [])].sort((a, b) => a.tier - b.tier);
  const currentTier = revealed?.next?.tier ?? setting?.tier ?? null;

  const tierColor = (t: number) => `var(--rank-${t}-text)`;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
        <header>
          <p className={`${mono} text-[#6e6a62]`}>Mathematics · No clock · No rating</p>
          <h1 className="mt-1.5 text-[32px] leading-none font-semibold tracking-[-0.045em]">Practice</h1>
        </header>

        <div role="group" aria-label="Tier" className="flex flex-wrap gap-1 rounded-(--radius-md) border border-line bg-surface p-[3px]">
          {[null, ...TIER_NAMES.map((_, i) => i + 1)].map((t) => {
            const selected = !!setting && (t === null ? setting.auto : !setting.auto && setting.tier === t);
            return (
              <button
                key={t ?? "auto"}
                type="button"
                onClick={() => pickTier(t)}
                disabled={busy || !setting}
                aria-pressed={selected}
                className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium disabled:cursor-default ${
                  selected ? "bg-surface-raised" : "text-[#8a867d] hover:text-text"
                }`}
                style={selected ? { color: t === null ? "var(--text)" : tierColor(t) } : undefined}
              >
                {t !== null && <RankBadge rank={t as Rank} size={16} decorative />}
                {t === null ? "Auto" : tierName(t)}
              </button>
            );
          })}
        </div>

        {setting?.auto && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
            <span>Auto stays between</span>
            {(["min", "max"] as const).map((end, i) => (
              <span key={end} className="flex items-center gap-2">
                {i === 1 && <span>and</span>}
                <select
                  aria-label={end === "min" ? "Easiest tier" : "Hardest tier"}
                  value={setting[end]}
                  onChange={(e) => pickRange(end, Number(e.target.value))}
                  disabled={busy}
                  className="h-8 cursor-pointer rounded-[6px] border border-line bg-surface px-2 text-[13px] font-medium disabled:cursor-default"
                  style={{ color: tierColor(setting[end]) }}
                >
                  {TIER_NAMES.map((name, t) => (
                    <option key={name} value={t + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </span>
            ))}
          </div>
        )}

        {error && !question ? (
          <section className={`${card} flex flex-col items-start gap-6 p-8`}>
            <p>{error}</p>
            <Link href="/play" className={secondary}>
              Back to lobby
            </Link>
          </section>
        ) : emptyTier && suggestion ? (
          <section className={`${card} flex flex-col items-start p-8`}>
            <h2 className="text-[24px] leading-[1.15] font-semibold tracking-[-0.03em]">No {tierName(emptyTier)} problems yet.</h2>
            <p className="mt-2 text-[15px] text-text-muted">More are on the way. Pick another tier for now.</p>
            <button onClick={() => pickTier(suggestion)} disabled={busy} className={`${secondary} mt-6`}>
              Try {tierName(suggestion)}
            </button>
          </section>
        ) : question ? (
          <>
            <section className={`${card} flex flex-col gap-6 p-6 md:p-8`} aria-label="Problem">
              <div className={`flex flex-wrap items-center justify-between gap-3 ${mono} text-[#6e6a62]`}>
                <span>
                  <span style={{ color: tierColor(question.tier) }}>{tierName(question.tier)}</span> · {question.topic}
                </span>
                <span>{setting?.auto ? "Auto · adjusts to your results" : "Fixed tier"}</span>
              </div>

              {setting?.auto && setting.progress !== null && setting.tier !== null && setting.tier < setting.max && (
                <div className="flex items-center gap-3 font-mono text-[11px] text-[#6e6a62]">
                  <span
                    role="progressbar"
                    aria-label={`Progress to ${tierName(setting.tier + 1)}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(setting.progress * 100)}
                    className="h-1 flex-1 rounded-full bg-surface-raised"
                  >
                    <span
                      className="block h-1 rounded-full transition-[width] duration-300"
                      style={{ width: `${setting.progress * 100}%`, background: `var(--rank-${setting.tier + 1})` }}
                    />
                  </span>
                  <span aria-hidden="true">
                    TO <span style={{ color: tierColor(setting.tier + 1) }}>{tierName(setting.tier + 1).toUpperCase()}</span>
                  </span>
                </div>
              )}

              <p className="font-mono text-[22px] leading-[34px] whitespace-pre-wrap">{question.prompt}</p>

              {!revealed && (
                <div className="flex flex-col gap-2.5">
                  <form onSubmit={submit} className="flex gap-2">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      inputMode="text"
                      autoComplete="off"
                      aria-label="Your answer"
                      placeholder="Integer or fraction, like 3/4"
                      className="h-12 w-full min-w-0 rounded-(--radius-md) border border-[#2c2c33] bg-bg px-4 font-mono text-[18px] text-text placeholder:font-sans placeholder:text-[15px] placeholder:text-[#6e6a62]"
                    />
                    <button disabled={busy || !input.trim()} className={`${primary} h-12`}>
                      Submit
                    </button>
                  </form>
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[13px]">
                    <button
                      type="button"
                      onClick={skip}
                      disabled={busy}
                      className="inline-flex min-h-8 cursor-pointer items-center text-[#8a867d] underline underline-offset-[3px] hover:text-text disabled:cursor-default disabled:no-underline disabled:opacity-40"
                    >
                      Skip and show the answer
                    </button>
                    {notice && (
                      <p role="status" className="py-1.5 text-text">
                        {notice}
                      </p>
                    )}
                  </div>
                  {error && <p className="text-[13px] text-accent-text">{error}</p>}
                </div>
              )}

              <div aria-live="polite">
                {revealed && (
                  <div className="flex flex-col gap-[18px] border-t border-line pt-5">
                    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                      <h2
                        className={`text-[24px] leading-tight font-semibold tracking-[-0.03em] ${
                          revealed.correct ? "text-[var(--rank-2-text)]" : revealed.yours === null ? "text-text-muted" : "text-[#ff8f80]"
                        }`}
                      >
                        {revealed.correct ? "Correct" : revealed.yours === null ? "Skipped" : "Not quite"}
                      </h2>
                      <p className="font-mono text-[13px] text-[#8a867d]">
                        ANSWER <span className="text-text">{revealed.answer}</span>
                      </p>
                      {revealed.yours !== null && !revealed.correct && (
                        <p className="font-mono text-[13px] text-[#8a867d]">YOURS {revealed.yours}</p>
                      )}
                    </div>

                    {revealed.next && (
                      <p className="font-mono text-[12px] tracking-[0.06em] text-text-muted">
                        NEXT: <span style={{ color: tierColor(revealed.next.tier) }}>{tierName(revealed.next.tier).toUpperCase()}</span>{" "}
                        <span aria-hidden="true">{revealed.next.up ? "↑" : "↓"}</span>
                        <span className="sr-only">{revealed.next.up ? "(up)" : "(down)"}</span>
                      </p>
                    )}

                    {revealed.solution && (
                      <div>
                        <p className="font-mono text-[10px] tracking-[0.14em] text-[#6e6a62]">PROOF</p>
                        <p className="mt-1.5 text-[15px] leading-6 whitespace-pre-wrap text-[#d6d2c9]">
                          {revealed.solution} <span className="text-accent-text">∎</span>
                        </p>
                      </div>
                    )}

                    {reporting === revealed.questionId ? (
                      <form onSubmit={(e) => sendReport(e, revealed.questionId)} className="flex flex-col gap-3">
                        <label htmlFor="report-reason" className="text-[14px] font-semibold">
                          What&apos;s wrong with this problem?
                        </label>
                        <textarea
                          id="report-reason"
                          autoFocus
                          rows={3}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="w-full rounded-(--radius-md) border border-line bg-bg px-4 py-3 text-[15px] text-text"
                        />
                        <div className="flex gap-2">
                          <button disabled={!reason.trim()} className={secondary}>
                            Send
                          </button>
                          <button type="button" onClick={() => setReporting(null)} className={quiet}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button type="button" onClick={next} disabled={busy} className={primary}>
                          Next problem
                        </button>
                        <span className="flex items-center gap-4 text-[12px] text-[#6e6a62]">
                          <span>Enter for the next problem</span>
                          {reported.has(revealed.questionId) ? (
                            <span>Reported.</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReporting(revealed.questionId)}
                              className="inline-flex min-h-8 cursor-pointer items-center text-[#8a867d] underline underline-offset-[3px] hover:text-text"
                            >
                              Report problem
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section aria-label="Scratch" className={`${card} overflow-hidden`}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 text-[12px] text-[#6e6a62]">
                <span className="font-mono text-[10px] tracking-[0.14em]">SCRATCH</span>
                <span>Private · cleared on next problem</span>
              </div>
              <ScratchPad value={scratch} onChange={setScratch} height={150} />
            </section>
          </>
        ) : (
          <section className={`${card} p-8`} aria-busy="true">
            <p className="text-[13px] text-text-muted">Loading…</p>
          </section>
        )}

        {notice && !question && (
          <p role="status" className="text-[14px] leading-[21px]">
            {notice}
          </p>
        )}
      </div>

      <aside aria-label="Your practice" className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
        <dl className="grid grid-cols-3 gap-3 rounded-(--radius-lg) border border-line p-5 font-mono">
          {[
            ["Streak", `${stats?.streak ?? 0}`],
            ["Best", `${stats?.best_streak ?? 0}`],
            ["Accuracy", accuracy === null ? "—" : `${accuracy}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col-reverse">
              <dt className="mt-1 text-[10px] tracking-[0.14em] text-[#6e6a62] uppercase">{k}</dt>
              <dd className="text-[28px] leading-8 font-semibold tracking-[-0.03em] tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="by-tier" className="rounded-(--radius-lg) border border-line px-5 pt-4 pb-3">
          <div className="flex justify-between pb-2 font-mono text-[10px] tracking-[0.14em] text-[#6e6a62]">
            <h2 id="by-tier">BY TIER</h2>
            <span aria-hidden="true">CORRECT</span>
          </div>
          <ul>
            {TIER_NAMES.map((name, i) => {
              const t = i + 1;
              const row = byTier.find((r) => r.tier === t);
              const done = row?.attempted ?? 0;
              const right = row?.correct ?? 0;
              const current = t === currentTier;
              return (
                <li key={name} className="grid grid-cols-[20px_minmax(0,1fr)_56px] items-center gap-2.5 border-t border-[#141418] py-2">
                  <RankBadge rank={t as Rank} size={18} decorative />
                  <div className="flex flex-col gap-[5px]">
                    <span className={`text-[13px] ${current ? "font-semibold" : ""}`} style={{ color: tierColor(t) }}>
                      {name}
                      {current && <span className="sr-only"> (current tier)</span>}
                    </span>
                    <span aria-hidden="true" className="h-0.5 rounded-full bg-surface-raised">
                      <span className="block h-0.5 rounded-full" style={{ width: `${done ? (100 * right) / done : 0}%`, background: `var(--rank-${t})` }} />
                    </span>
                  </div>
                  <span className="text-right font-mono text-[12px] text-text-muted tabular-nums">
                    {right}/{done}
                    <span className="sr-only"> correct</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-[12px] leading-[18px] text-[#6e6a62]">
          Every answer here also counts toward your mastery map. Practice never changes your Elo.
        </p>
      </aside>
    </div>
  );
}

const rangeLabel = (min: number, max: number) =>
  min === 1 && max === 6 ? "all tiers" : min === max ? tierName(min) : `${tierName(min)}–${tierName(max)}`;

const mono = "font-mono text-[11px] tracking-[0.12em] uppercase";
const card = "rounded-(--radius-lg) border border-line bg-surface";
const primary =
  "inline-flex h-11 flex-none cursor-pointer items-center justify-center rounded-(--radius-md) bg-text px-[22px] text-[14px] font-semibold text-bg hover:bg-text/90 disabled:cursor-default disabled:opacity-40";
const secondary =
  "inline-flex h-11 flex-none cursor-pointer items-center justify-center rounded-(--radius-md) border border-[#2c2c33] px-5 text-[14px] text-text hover:border-text-muted disabled:cursor-default disabled:opacity-40";
const quiet = "inline-flex min-h-11 cursor-pointer items-center text-[14px] text-text-muted hover:text-text";
