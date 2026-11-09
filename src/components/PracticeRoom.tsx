"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError, tierName, TIER_NAMES, type PracticeQuestion, type PracticeStats } from "@/lib/erudent";

/** What the server revealed after an answer or a skip. `yours` is null for a skip. */
type Revealed = { questionId: string; correct: boolean; answer: string; solution: string; yours: string | null };

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
    setRevealed({ questionId: pendingId.current!, correct: r.correct, answer: r.answer, solution: r.solution, yours });
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

  function report(questionId: string) {
    const reason = window.prompt("What's wrong with this question?");
    if (!reason) return;
    api.reportPracticeQuestion(sb, questionId, reason).catch(() => {});
    setReported((s) => new Set(s).add(questionId));
  }

  if (error && !question) {
    return (
      <div className="flex flex-col gap-4">
        <p>{error}</p>
        <Link href="/play" className="self-start underline">Back to lobby</Link>
      </div>
    );
  }
  if (!setting) return <p className="text-muted">Loading…</p>;

  const chip = (selected: boolean) =>
    `min-h-11 border px-1 text-sm disabled:opacity-40 ${selected ? "border-foreground bg-foreground text-background" : "border-line"}`;
  const suggestion = emptyTier ? (emptyTier > 1 ? emptyTier - 1 : 2) : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-widest text-muted">Tier</h2>
        <div className="grid grid-cols-4 gap-2">
          <button onClick={() => pickTier(null)} disabled={busy} aria-pressed={!!setting?.auto} className={chip(!!setting?.auto)}>
            Auto
          </button>
          {TIER_NAMES.map((name, i) => {
            const selected = !!setting && !setting.auto && setting.tier === i + 1;
            return (
              <button key={name} onClick={() => pickTier(i + 1)} disabled={busy} aria-pressed={selected} className={chip(selected)}>
                {name}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted">
          <span>{setting?.tier ? `${setting.auto ? "Auto · " : ""}${tierName(setting.tier)}` : "Auto"}</span>
          {stats && (
            <span className="tabular-nums">
              {stats.correct} / {stats.attempted} correct · streak {stats.streak} · best {stats.best_streak}
            </span>
          )}
        </div>
      </section>

      {emptyTier && suggestion && (
        <section className="flex flex-col gap-3 border border-line p-5">
          <p>No {tierName(emptyTier)} questions yet.</p>
          <p className="text-sm text-muted">More are on the way. Pick another tier for now.</p>
          <button onClick={() => pickTier(suggestion)} disabled={busy} className="self-start border border-foreground px-4 py-3 disabled:opacity-40">
            Try {tierName(suggestion)}
          </button>
        </section>
      )}

      {question && (
        <section className="flex flex-col gap-6 border border-line p-5">
          <span className="text-xs uppercase tracking-widest text-muted">
            {tierName(question.tier)} · {question.topic}
          </span>
          <p className="font-serif text-xl whitespace-pre-wrap">{question.prompt}</p>
          <form onSubmit={submit} className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              readOnly={!!revealed}
              inputMode="text"
              autoComplete="off"
              aria-label="Your answer"
              placeholder="Integer or fraction, e.g. 12 or 3/4"
              className="w-full min-w-0 border border-line bg-background px-3 py-3 font-mono outline-none focus:border-foreground read-only:text-muted"
            />
            <button
              disabled={busy || (!revealed && !input.trim())}
              className="border border-foreground bg-foreground px-5 text-background disabled:opacity-40"
            >
              {revealed ? "Next" : "Submit"}
            </button>
          </form>
          {revealed ? (
            <p className="text-xs text-muted">Press Enter for the next question.</p>
          ) : (
            <button onClick={skip} disabled={busy} className="self-start text-sm text-muted underline disabled:no-underline">
              Skip and show the answer
            </button>
          )}
        </section>
      )}

      {revealed && (
        <section aria-live="polite" className="flex flex-col gap-2 border border-foreground p-5">
          <h2 className="font-serif text-3xl">{revealed.correct ? "Correct" : revealed.yours === null ? "Skipped" : "Wrong"}</h2>
          {!revealed.correct && revealed.yours !== null && (
            <p className="text-sm text-muted">You: <span className="font-mono">{revealed.yours}</span></p>
          )}
          <p className="text-sm">Answer: <span className="font-mono">{revealed.answer}</span></p>
          {revealed.solution && <p className="text-sm text-muted whitespace-pre-wrap">{revealed.solution}</p>}
          <button
            disabled={reported.has(revealed.questionId)}
            onClick={() => report(revealed.questionId)}
            className="self-start text-xs text-muted underline disabled:no-underline"
          >
            {reported.has(revealed.questionId) ? "Reported" : "Report question"}
          </button>
        </section>
      )}

      {notice && <p className="text-sm">{notice}</p>}
      {error && question && <p className="text-sm">{error}</p>}
    </div>
  );
}
