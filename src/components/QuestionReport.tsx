"use client";

import { useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api, type Slot } from "@/lib/erudent";

const reasons = ["Wrong answer", "Unclear", "Typo"] as const;
type Reason = (typeof reasons)[number];
type State = { open?: boolean; pending?: boolean; saved?: boolean; error?: string };

/**
 * Reports the actual match question; never marks a failed request as saved.
 * State is keyed by match + slot because the play view reuses one instance across slots.
 * `compact` keeps it to one short line so it fits beside the question header during a timed duel.
 */
export default function QuestionReport({ matchId, slot, compact = false }: { matchId: string; slot: Slot; compact?: boolean }) {
  const id = useId();
  const [states, setStates] = useState<Record<string, State>>({});
  const inFlight = useRef(new Set<string>());
  const key = matchId + ":" + slot;
  const state = states[key] ?? {};
  const update = (patch: State) =>
    setStates((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  async function report(reason: Reason) {
    if (inFlight.current.has(key) || state.saved) return;
    inFlight.current.add(key);
    update({ pending: true, error: undefined });
    try {
      await api.reportQuestion(createClient(), matchId, slot, reason);
      update({ saved: true, open: false });
    } catch {
      update({ error: "Couldn't save your report. Please try again." });
    } finally {
      inFlight.current.delete(key);
      update({ pending: false });
    }
  }

  const target = compact ? "min-h-7" : "min-h-11";

  return (
    <div className={`text-[12px] text-ink-muted ${compact ? "text-right" : ""}`}>
      {state.saved ? (
        <p role="status" className={compact ? "py-1" : "py-2"}>
          Report saved. Thank you.
        </p>
      ) : (
        <>
          <button
            type="button"
            aria-label={"Report question " + slot}
            aria-expanded={!!state.open}
            aria-controls={id}
            disabled={state.pending}
            onClick={() => update({ open: !state.open })}
            className={`inline-flex ${target} items-center gap-1.5 hover:text-ink disabled:opacity-50`}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M3 14V2h9l-2 3 2 3H3" />
            </svg>
            Report
          </button>
          <div id={id} hidden={!state.open}>
            <p>What needs fixing?</p>
            <div
              className={`flex flex-wrap gap-2 ${compact ? "justify-end" : ""}`}
              role="group"
              aria-label={"Reason for reporting question " + slot}
            >
              {reasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={state.pending}
                  onClick={() => void report(reason)}
                  className={`${target} rounded-(--r-md) border border-line px-3 hover:text-ink disabled:opacity-50`}
                >
                  {reason}
                </button>
              ))}
            </div>
            {state.pending && <p role="status">Saving report…</p>}
            {state.error && <p role="alert">{state.error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
