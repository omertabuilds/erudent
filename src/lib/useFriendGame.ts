"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { api, friendlyError } from "@/lib/erudent";

const POLL_MS = 2000;

export type FriendCode = { match_id: string; code: string };

/**
 * The friend-game flow, shared by the lobby's Unranked card and the profile's Challenge button:
 * create a game (a 6-character code), poll until the friend joins, then open the match.
 * Friend games are unrated.
 */
export function useFriendGame(sb: SupabaseClient) {
  const router = useRouter();
  const [friendCode, setFriendCode] = useState<FriendCode | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  // Wait for the friend to join.
  useEffect(() => {
    if (!friendCode) return;
    const t = setInterval(async () => {
      const m = await api.getMatch(sb, friendCode.match_id).catch(() => null);
      if (m && m.status !== "waiting") router.push(`/match/${m.id}`);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [friendCode, sb, router]);

  async function createFriend() {
    setError(null);
    setCreating(true);
    try {
      setFriendCode(await api.createFriendMatch(sb));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setCreating(false);
    }
  }

  function copy(what: "link" | "code", text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        setCopied(what);
        copiedTimer.current = setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => {});
  }

  const inviteLink = friendCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${friendCode.code}` : "";

  return { friendCode, creating, createFriend, copy, copied, inviteLink, error, setError };
}
