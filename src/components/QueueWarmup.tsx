"use client";

import { useEffect, useRef, useState } from "react";
import { check, clock, digits, nextProblem, spoken, type Problem } from "@/lib/warmup";

const BEST_KEY = "erudent.warmup.best";

function readBest(): number {
  try {
    const n = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // Private mode or storage full: the best score just isn't kept.
  }
}

/**
 * Arithmetic while the ranked queue runs, Zetamac-style. The field moves on the instant it holds
 * the answer; there is no Enter. A wrong digit stays until it's fixed and breaks the streak.
 *
 * This component owns only its own state. The queue poll lives in Lobby and never reads it, so
 * typing here can't slow or restart matchmaking. Unmounting (leaving the queue) resets it.
 *
 * `elapsedSec` is the time in queue. `found` is the seconds left before the match opens, or null
 * while still searching; once it's set the field locks.
 */
export default function QueueWarmup({ elapsedSec, found }: { elapsedSec: number; found: number | null }) {
  // Drawn after mount, so a server render and the browser never disagree on the first problem.
  const [problem, setProblem] = useState<Problem | null>(null);
  const [value, setValue] = useState("");
  const [solved, setSolved] = useState(0);
  const [streak, setStreak] = useState(0);
  const [missed, setMissed] = useState(false);
  const [pace, setPace] = useState<number | null>(null);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const startedAt = useRef(0);
  /** The record when this queue began: beating it is what earns the ∎. */
  const priorBest = useRef(0);
  const locked = found !== null;

  useEffect(() => {
    startedAt.current = Date.now();
    setProblem(nextProblem(null));
    priorBest.current = readBest();
    setBest(priorBest.current);
  }, []);

  function onChange(raw: string) {
    if (locked || !problem) return;
    const v = digits(raw);
    const state = check(v, problem.answer);
    if (state === "solved") {
      const n = solved + 1;
      setSolved(n);
      setStreak(missed ? 1 : streak + 1);
      setMissed(false);
      setPace((Date.now() - startedAt.current) / 1000 / n);
      if (n > best) {
        setBest(n);
        saveBest(n);
        // Only a beaten record counts as new, not the first run on this device.
        if (priorBest.current > 0) setNewBest(true);
      }
      setProblem(nextProblem(problem));
      setValue("");
      return;
    }
    if (state === "wrong" && !missed) {
      setMissed(true);
      setStreak(0);
    }
    setValue(v);
  }

  const hud: [string, string][] = [
    ["Solved", String(solved)],
    ["Streak", String(streak)],
    ["Pace", pace === null ? "—" : `${pace.toFixed(1)}s`],
    ["In queue", clock(elapsedSec)],
  ];

  return (
    <section aria-label="Warmup" className="rounded-(--r-md) border border-hairline bg-surface p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[13px] leading-[18px] font-semibold text-ink-muted">Warmup while you wait</p>
        <p className="text-[13px] leading-[18px] text-ink-muted tabular-nums">
          {best > 0 && (
            <>
              Best {best}
              {newBest && <span className="ml-1 text-pencil">∎</span>}
              {newBest && <span className="sr-only"> (new best)</span>}
            </>
          )}
        </p>
      </div>

      {found !== null && (
        // Lobby's ranked row announces this (aria-live); this is the visual banner.
        <p
          aria-hidden="true"
          className="mt-5 flex min-h-[72px] items-center rounded-(--r-sm) border border-rule px-4 text-[19px] leading-[29px] font-semibold"
        >
          <span>
            Opponent found.{" "}
            <span className="whitespace-nowrap">
              Starting in <span className="tabular-nums">{Math.max(1, found)}</span>…
            </span>
          </span>
        </p>
      )}

      <div className={`mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 ${locked ? "text-ink-muted" : ""}`}>
        <p
          aria-hidden="true"
          className="text-[clamp(36px,9vw,48px)] leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap tabular-nums"
        >
          {problem ? `${problem.a} ${problem.op} ${problem.b} =` : "\u00a0"}
        </p>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          disabled={locked}
          aria-label={problem ? `${spoken(problem)} equals` : "Answer"}
          aria-invalid={!!problem && check(value, problem.answer) === "wrong"}
          className="h-14 w-[7.5rem] min-w-0 rounded-(--r-md) border border-hairline bg-sunken px-4 text-[24px] font-extrabold text-ink tabular-nums hover:border-rule aria-invalid:border-rule disabled:opacity-40"
        />
      </div>

      <dl className="mt-6 grid grid-cols-4 gap-2 border-t border-hairline pt-4">
        {hud.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[13px] leading-[18px] text-ink-muted">{k}</dt>
            <dd className="text-[19px] leading-[29px] font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">Type the answer. It moves on by itself. Doesn&apos;t count toward anything.</p>
    </section>
  );
}
