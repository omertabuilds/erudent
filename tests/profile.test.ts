import { describe, expect, test } from "vitest";
import type { RecentMatch } from "@/lib/erudent";
import { eloSeries, headToHead, nextRank, tierForElo, tierFromRankName, tierOf, timeAgo, timeAgoLong, winRate } from "@/lib/profile";

const match = (over: Partial<RecentMatch>): RecentMatch => ({
  match_id: "m",
  mode: "ranked",
  finished_at: "2026-11-18T12:00:00Z",
  result: "win",
  elo_before: 1000,
  elo_after: 1010,
  opponent: "rho",
  score: 3,
  opponent_score: 1,
  ...over,
});

describe("ranks", () => {
  test("tierForElo mirrors public.tier_for_elo at every edge", () => {
    expect([0, 699, 700, 899, 900, 1099, 1100, 1299, 1300, 1499, 1500, 2400].map(tierForElo)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
  });

  test("tierOf hides the rank during placement", () => {
    expect(tierOf(1600, 9)).toBe(0);
    expect(tierOf(1600, 10)).toBe(6);
  });

  test("tierFromRankName", () => {
    expect(tierFromRankName("Novice")).toBe(1);
    expect(tierFromRankName("Erudite")).toBe(6);
    expect(tierFromRankName("Unranked")).toBe(0);
  });

  test("nextRank is the rank above and where it starts; none at Erudite", () => {
    expect(nextRank(650)).toEqual({ tier: 2, name: "Apprentice", elo: 700 });
    expect(nextRank(1482)).toEqual({ tier: 6, name: "Erudite", elo: 1500 });
    expect(nextRank(1300)).toEqual({ tier: 6, name: "Erudite", elo: 1500 });
    expect(nextRank(1500)).toBeNull();
  });
});

describe("eloSeries", () => {
  test("oldest first: Elo before the first rated duel, then after each", () => {
    const newestFirst = [
      match({ finished_at: "2026-11-18T00:00:00Z", elo_before: 1020, elo_after: 1012 }),
      match({ finished_at: "2026-11-17T00:00:00Z", mode: "friend", elo_before: 1020, elo_after: null }),
      match({ finished_at: "2026-11-16T00:00:00Z", elo_before: 1000, elo_after: 1020 }),
    ];
    expect(eloSeries(newestFirst).map((p) => p.elo)).toEqual([1000, 1020, 1012]);
  });

  test("skips friend games and unscored runs; empty without a rated duel", () => {
    expect(eloSeries([match({ mode: "friend", elo_after: null }), match({ mode: "async", elo_after: null })])).toEqual([]);
    expect(eloSeries([])).toEqual([]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const ago = (sec: number) => new Date(now - sec * 1000).toISOString();

  test("compact units", () => {
    expect(timeAgo(ago(30), now)).toBe("now");
    expect(timeAgo(ago(5 * 60), now)).toBe("5m");
    expect(timeAgo(ago(3 * 3600), now)).toBe("3h");
    expect(timeAgo(ago(2 * 86400), now)).toBe("2d");
    expect(timeAgo(ago(15 * 86400), now)).toBe("2w");
    expect(timeAgo(ago(100 * 86400), now)).toBe("3mo");
    expect(timeAgo(ago(800 * 86400), now)).toBe("2y");
  });

  test("a clock slightly ahead never shows negative time", () => {
    expect(timeAgo(ago(-20), now)).toBe("now");
  });

  test("long form", () => {
    expect(timeAgoLong(ago(3600), now)).toBe("1 hour ago");
    expect(timeAgoLong(ago(3 * 86400), now)).toBe("3 days ago");
    expect(timeAgoLong(ago(100 * 86400), now)).toBe("3 months ago");
    expect(timeAgoLong(ago(5), now)).toBe("just now");
  });
});

test("winRate counts draws in the total; null before any duel", () => {
  expect(winRate(7, 2, 1)).toBe(70);
  expect(winRate(1, 2, 0)).toBe(33);
  expect(winRate(0, 0, 0)).toBeNull();
});

describe("headToHead", () => {
  const matches = [
    match({ match_id: "a", opponent: "Eliam", result: "loss", finished_at: "2026-11-18T00:00:00Z" }),
    match({ match_id: "b", opponent: "chris", result: "win" }),
    match({ match_id: "c", opponent: "eliam", result: "win", finished_at: "2026-11-10T00:00:00Z" }),
    match({ match_id: "d", opponent: "eliam", result: "draw", finished_at: "2026-11-09T00:00:00Z" }),
    match({ match_id: "e", opponent: null, result: "win" }),
  ];

  test("the viewer's side: this player's losses are the viewer's wins; newest is the last meeting", () => {
    expect(headToHead(matches, "eliam")).toEqual({
      wins: 1,
      losses: 1,
      draws: 1,
      lastAt: "2026-11-18T00:00:00Z",
      lastMatchId: "a",
    });
  });

  test("null when they haven't met", () => {
    expect(headToHead(matches, "nobody")).toBeNull();
  });
});
