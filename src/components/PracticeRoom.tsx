"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError, tierName, TIER_NAMES, type PracticeQuestion, type PracticeStats } from "@/lib/erudent";
import { kicker, pill, quiet, secondary, sheet } from "@/components/ui";

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

/** Auto, or one fixed tier. `tier` is where the next question comes from. */
type Setting = { auto: boolean; tier: number | null };

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
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingId = useRef<string | null>(null); // question on screen, not yet answered

  const refreshStats = useCallback(() => api.practiceStats(sb).then(setStats).catch(() => {}), [sb]);

  // Ask for a question. The server hands back the unanswered one if there is one,
  // so a tier change only takes effect once it's answered or skipped.
  const load = useCallback(
    async (tier: number | null, changingTier = false) => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        const q = await api.nextPracticeQuestion(sb, tier);
        setEmptyTier(null);
        setSetting({ auto: q.auto, tier: q.selected_tier });
        setQuestion(q);
        if (q.question_id === pendingId.current) {
          if (changingTier) {
            const label = q.auto ? "Auto" : tierName(q.selected_tier);
            setNotice(`${label} starts with the next question. Skip to switch now.`);
          }
        } else {
          pendingId.current = q.question_id;
          setRevealed(null);
          setInput("");
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
        setSetting({ auto: s.auto, tier: s.tier });
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
    setSetting((s) => (s ? { ...s, tier: r.tier } : s)); // auto may have moved
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

  return (
    <div className="grid gap-12 md:grid-cols-12 md:gap-x-8 lg:gap-x-16">
      <div className="flex min-w-0 flex-col gap-6 md:col-span-8">
        <section aria-label="Tier" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => pickTier(null)} disabled={busy || !setting} aria-pressed={!!setting?.auto} className={pill(!!setting?.auto)}>
              Auto
            </button>
            {TIER_NAMES.map((name, i) => {
              const selected = !!setting && !setting.auto && setting.tier === i + 1;
              return (
                <button key={name} onClick={() => pickTier(i + 1)} disabled={busy || !setting} aria-pressed={selected} className={pill(selected)}>
                  {name}
                </button>
              );
            })}
          </div>
          <p className="text-[13px] leading-[18px] text-ink-muted">
            {!setting ? "\u00a0" : setting.tier ? `${setting.auto ? "Auto · " : ""}${tierName(setting.tier)}` : "Auto"}
          </p>
        </section>

        {error && !question ? (
          <section className={`${sheet} justify-center`}>
            <p>{error}</p>
            <Link href="/play" className={`${secondary} mt-6 self-start`}>
              Back to lobby
            </Link>
          </section>
        ) : emptyTier && suggestion ? (
          <section className={sheet}>
            <h2 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em]">No {tierName(emptyTier)} problems yet.</h2>
            <p className="mt-3 text-ink-muted">More are on the way. Pick another tier for now.</p>
            <button onClick={() => pickTier(suggestion)} disabled={busy} className={`${secondary} mt-8 self-start`}>
              Try {tierName(suggestion)}
            </button>
          </section>
        ) : question ? (
          <section className={sheet} aria-label="Problem">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[13px] leading-[18px] font-semibold text-ink-muted tabular-nums">№ {revealed ? revealed.no : attempted + 1}</span>
              <span className="text-[13px] leading-[18px] text-ink-muted">
                {tierName(question.tier)} · {question.topic}
              </span>
            </div>

            <p className="mt-6 text-[21px] leading-[31px] whitespace-pre-wrap">{question.prompt}</p>

            <form onSubmit={submit} className="mt-8 flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                readOnly={!!revealed}
                inputMode="text"
                autoComplete="off"
                aria-label="Your answer"
                placeholder="12 or 3/4"
                className="h-14 w-full min-w-0 rounded-(--r-md) border border-hairline bg-sunken px-4 text-[19px] text-ink tabular-nums placeholder:text-ink-muted read-only:text-ink-muted"
              />
              <button
                disabled={busy || (!revealed && !input.trim())}
                className="h-14 flex-none rounded-(--r-md) bg-ink px-6 text-[15px] font-bold text-on-ink disabled:opacity-40"
              >
                {revealed ? "Next" : "Submit"}
              </button>
            </form>

            {!revealed && (
              <button onClick={skip} disabled={busy} className={`${quiet} mt-2 self-start underline underline-offset-4 disabled:no-underline`}>
                Skip and show the answer
              </button>
            )}

            {notice && (
              <p role="status" className="mt-4 text-[15px] leading-[22px]">
                {notice}
              </p>
            )}
            {error && <p className="mt-4 text-[15px] leading-[22px]">{error}</p>}

            <div aria-live="polite">
              {revealed && (
                <div className="mt-8 border-t border-hairline pt-8">
                  <h2 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em]">
                    {revealed.correct ? (
                      <>
                        <span className="text-pencil">✓</span> Correct.
                      </>
                    ) : revealed.yours === null ? (
                      "Skipped."
                    ) : (
                      <span className="text-ink-muted">✗ Wrong.</span>
                    )}
                  </h2>

                  <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
                    <div className="flex items-baseline gap-3">
                      <dt className="text-[15px] font-semibold text-ink-muted">Answer</dt>
                      <dd className="text-[22px] leading-[28px] font-bold tabular-nums">{revealed.answer}</dd>
                    </div>
                    {revealed.yours !== null && (
                      <div className="flex items-baseline gap-3">
                        <dt className="text-[15px] font-semibold text-ink-muted">You</dt>
                        <dd className={`text-[22px] leading-[28px] font-bold tabular-nums ${revealed.correct ? "" : "text-ink-muted"}`}>{revealed.yours}</dd>
                      </div>
                    )}
                  </dl>

                  {revealed.next && (
                    <p className="mt-3 text-[15px] leading-[22px] font-semibold">
                      Next: {tierName(revealed.next.tier)} {revealed.next.up ? "↑" : "↓"}
                    </p>
                  )}

                  {revealed.solution && (
                    <div className="mt-8">
                      <p className={kicker}>Proof</p>
                      <p className="mt-3 whitespace-pre-wrap">
                        {revealed.solution} <span className="text-pencil">∎</span>
                      </p>
                    </div>
                  )}

                  {reporting === revealed.questionId ? (
                    <form onSubmit={(e) => sendReport(e, revealed.questionId)} className="mt-8 flex flex-col gap-3">
                      <label htmlFor="report-reason" className="text-[15px] font-semibold">
                        What&apos;s wrong with this problem?
                      </label>
                      <textarea
                        id="report-reason"
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
                        <button type="button" onClick={() => setReporting(null)} className={secondary}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4">
                      <p className="text-[13px] leading-[18px] text-ink-muted">Enter for the next problem</p>
                      {reported.has(revealed.questionId) ? (
                        <p className={`${quiet} cursor-default`}>Reported.</p>
                      ) : (
                        <button onClick={() => setReporting(revealed.questionId)} className={quiet}>
                          Report problem
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className={sheet} aria-busy="true">
            <p className="text-[13px] leading-[18px] text-ink-muted">Loading…</p>
          </section>
        )}

        {notice && !question && (
          <p role="status" className="text-[15px] leading-[22px]">
            {notice}
          </p>
        )}
      </div>

      <aside aria-label="Your practice" className="flex flex-col md:col-span-4">
        <p className={kicker}>Streak</p>
        <p className="mt-2 text-[80px] leading-[0.9] font-extrabold tracking-[-0.04em] tabular-nums">{stats?.streak ?? 0}</p>

        <dl className="mt-8 border-t border-hairline">
          {[
            ["Best streak", `${stats?.best_streak ?? 0}`],
            ["Correct", `${stats?.correct ?? 0}/${attempted}`],
            ["Accuracy", accuracy === null ? "—" : `${accuracy}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-b border-hairline py-3">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <p className={`${kicker} mt-10`}>By tier</p>
        {byTier.length ? (
          <table className="mt-3 w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="border-b border-hairline text-[13px] text-ink-muted">
                <th scope="col" className="w-6 py-2 font-normal">
                  <span className="sr-only">Current</span>
                </th>
                <th scope="col" className="py-2 font-normal">Tier</th>
                <th scope="col" className="py-2 text-right font-normal">Done</th>
                <th scope="col" className="py-2 text-right font-normal">%</th>
              </tr>
            </thead>
            <tbody>
              {byTier.map((t) => {
                const current = t.tier === currentTier;
                return (
                  <tr key={t.tier} className="border-b border-hairline">
                    <td className="py-3 text-ink-muted">{current && (
                        <>
                          <span aria-hidden="true">→</span>
                          <span className="sr-only">Current tier</span>
                        </>
                      )}</td>
                    <td className={`py-3 ${current ? "font-semibold" : ""}`}>{tierName(t.tier)}</td>
                    <td className="py-3 text-right">{t.attempted}</td>
                    <td className="py-3 text-right">{t.attempted ? Math.round((100 * t.correct) / t.attempted) : 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">Nothing yet. Answer one to start the table.</p>
        )}
      </aside>
    </div>
  );
}
