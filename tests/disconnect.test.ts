import { describe, expect, test } from "vitest";
import { DISCONNECT_AFTER_MS, disconnectLeft, FORFEIT_AFTER_MS } from "@/lib/disconnect";
import type { MatchState } from "@/lib/erudent";

// The "Opponent disconnected" banner: when it shows, when it clears, and its countdown.
// Everything is in server time, from get_match's opponent.last_seen.

const T0 = Date.parse("2026-11-20T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function match(over: { mode?: MatchState["mode"]; status?: MatchState["status"]; lastSeen?: number | null; ghost?: boolean; noOpponent?: boolean } = {}) {
  const lastSeen = over.lastSeen === undefined ? T0 : over.lastSeen;
  return {
    mode: over.mode ?? "ranked",
    status: over.status ?? "active",
    opponent: over.noOpponent
      ? null
      : { is_ghost: over.ghost ?? false, last_seen: lastSeen === null ? null : iso(lastSeen) },
  } as unknown as MatchState;
}

/** The banner's clock, as shown: m:ss rounded up. */
const shown = (ms: number | null) => {
  if (ms === null) return null;
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

describe("disconnectLeft", () => {
  test("hidden while the opponent was seen within 5s", () => {
    expect(disconnectLeft(match(), true, T0)).toBeNull();
    expect(disconnectLeft(match(), true, T0 + 3_000)).toBeNull();
    expect(disconnectLeft(match(), true, T0 + DISCONNECT_AFTER_MS)).toBeNull(); // exactly 5s: not yet
  });

  test("shows after more than 5s of silence, counting down to the 30s forfeit", () => {
    expect(shown(disconnectLeft(match(), true, T0 + 5_001))).toBe("0:25");
    expect(shown(disconnectLeft(match(), true, T0 + 10_000))).toBe("0:20");
    expect(shown(disconnectLeft(match(), true, T0 + 29_500))).toBe("0:01");
  });

  test("stops at 0:00 and stays there until the forfeit lands", () => {
    expect(disconnectLeft(match(), true, T0 + FORFEIT_AFTER_MS)).toBe(0);
    expect(disconnectLeft(match(), true, T0 + 45_000)).toBe(0);
  });

  test("clears as soon as a newer last_seen arrives", () => {
    const now = T0 + 12_000;
    expect(disconnectLeft(match(), true, now)).not.toBeNull();
    expect(disconnectLeft(match({ lastSeen: now - 500 }), true, now)).toBeNull();
  });

  test("driven by the server's stamp, so a reload picks up the same countdown", () => {
    // A fresh page has only get_match: the same last_seen and server time give the same clock.
    const a = disconnectLeft(match(), true, T0 + 18_000);
    const b = disconnectLeft(match(), true, T0 + 18_000);
    expect(shown(a)).toBe("0:12");
    expect(b).toBe(a);
  });

  test("never in a recorded run", () => {
    expect(disconnectLeft(match({ mode: "async" }), true, T0 + 20_000)).toBeNull();
    expect(disconnectLeft(match({ ghost: true }), true, T0 + 20_000)).toBeNull();
    expect(disconnectLeft(match({ lastSeen: null }), true, T0 + 20_000)).toBeNull();
  });

  test("never before the opponent joins, outside the live phase, or after the end", () => {
    expect(disconnectLeft(match({ noOpponent: true }), true, T0 + 20_000)).toBeNull();
    expect(disconnectLeft(match({ status: "waiting" }), false, T0 + 20_000)).toBeNull();
    expect(disconnectLeft(match(), false, T0 + 20_000)).toBeNull(); // countdown phase
    expect(disconnectLeft(match({ status: "finished" }), true, T0 + 20_000)).toBeNull();
    expect(disconnectLeft(match({ status: "void" }), true, T0 + 20_000)).toBeNull();
  });

  test("friend duels show it too", () => {
    expect(shown(disconnectLeft(match({ mode: "friend" }), true, T0 + 6_000))).toBe("0:24");
  });
});
