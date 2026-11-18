"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api, friendlyError, TIER_NAMES, type MyPlayer } from "@/lib/erudent";
import { useFriendGame } from "@/lib/useFriendGame";
import RankBadge, { type Rank } from "@/components/RankBadge";
import { CustomizePanel } from "@/components/ProfileBanner";

const primary =
  "inline-flex h-[42px] flex-none cursor-pointer items-center rounded-(--radius-md) bg-text px-[22px] text-[14px] font-semibold text-bg hover:bg-text/90 disabled:cursor-default disabled:opacity-40";
const outline =
  "inline-flex h-[42px] flex-none cursor-pointer items-center justify-center rounded-(--radius-md) border border-[#2c2c33] bg-[rgba(11,11,13,0.6)] text-[14px] font-medium text-text hover:border-text-muted aria-expanded:border-text disabled:cursor-default disabled:opacity-40";
const quiet = "inline-flex min-h-11 cursor-pointer items-center text-[14px] text-text-muted hover:text-text disabled:cursor-default disabled:opacity-40";
const panel = "rounded-(--radius-lg) border border-[#2c2c33] bg-surface";

/** Who is looking: the player themself, another signed-in player, or someone signed out. */
export type Viewer = { kind: "owner"; player: MyPlayer } | { kind: "player"; reportMatchId: string | null } | { kind: "signed-out" };

/**
 * Picture with the rank ring, handle in the rank color, badge and rank name, tagline; then the
 * actions for this viewer. Visitors: Challenge (a friend game) and Report. Owner: Edit profile,
 * which opens the same customize panel as /play.
 */
export default function ProfileHeader({
  username,
  tier,
  tagline,
  pictureUrl,
  joined,
  viewer,
}: {
  username: string;
  /** 1–6, or 0 during placement. */
  tier: number;
  tagline: string | null;
  pictureUrl: string | null;
  joined: string;
  viewer: Viewer;
}) {
  const ranked = tier >= 1;
  const rankText = ranked ? `var(--rank-${tier}-text)` : "var(--text)";
  const [open, setOpen] = useState<"edit" | "challenge" | "report" | null>(null);
  const [picture, setPicture] = useState(pictureUrl);
  const panelId = useId();
  const here = `/u/${encodeURIComponent(username)}`;

  const toggle = (p: NonNullable<typeof open>) => setOpen(open === p ? null : p);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 items-end gap-4 md:gap-[22px]">
          <span
            aria-hidden="true"
            className="flex size-[88px] flex-none items-center justify-center overflow-hidden rounded-full bg-text text-[34px] leading-none font-bold text-bg select-none md:size-28 md:text-[44px]"
            style={{ boxShadow: ranked ? `0 0 0 4px var(--bg), 0 0 0 6px var(--rank-${tier})` : "0 0 0 4px var(--bg)" }}
          >
            {picture ? (
              // A user-uploaded file on Supabase Storage, already 256×256: next/image would only add a remote config.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picture} alt="" className="size-full object-cover" />
            ) : (
              username.charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 pb-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                className="text-[28px] leading-none font-semibold tracking-[-0.045em] break-all md:text-[36px]"
                style={{ color: rankText }}
              >
                {username}
              </h1>
              {ranked ? (
                <span className="flex items-center gap-1.5">
                  <RankBadge rank={tier as Rank} size={24} decorative />
                  <span className="font-mono text-[11px] tracking-[0.12em] uppercase" style={{ color: rankText }}>
                    {TIER_NAMES[tier - 1]}
                  </span>
                </span>
              ) : (
                <span className="font-mono text-[11px] tracking-[0.12em] text-text-muted uppercase">Unranked</span>
              )}
            </div>
            {tagline && <p className="mt-2 text-[14px] leading-5 text-[#d6d2c9]">{tagline}</p>}
            <p className="mt-1 text-[13px] leading-5 text-[#8a867d]">Joined {joined}</p>
          </div>
        </div>

        <div className="flex gap-2 pb-1.5">
          {viewer.kind === "owner" ? (
            <button type="button" onClick={() => toggle("edit")} aria-expanded={open === "edit"} aria-controls={panelId} className={`${outline} px-5`}>
              {open === "edit" ? "Close" : "Edit profile"}
            </button>
          ) : viewer.kind === "signed-out" ? (
            <>
              <Link href={`/login?next=${encodeURIComponent(here)}`} className={primary}>
                Challenge
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(here)}`}
                aria-label="Sign in to report this profile"
                title="Report profile"
                className={`${outline} size-[42px] text-text-muted`}
              >
                <FlagIcon />
              </Link>
            </>
          ) : (
            <>
              <button type="button" onClick={() => toggle("challenge")} aria-expanded={open === "challenge"} aria-controls={panelId} className={primary}>
                Challenge
              </button>
              <button
                type="button"
                onClick={() => toggle("report")}
                aria-expanded={open === "report"}
                aria-controls={panelId}
                aria-label="Report profile"
                title="Report profile"
                className={`${outline} size-[42px] text-text-muted`}
              >
                <FlagIcon />
              </button>
            </>
          )}
        </div>
      </div>

      <div id={panelId}>
        {open === "edit" && viewer.kind === "owner" && (
          <div className={`overflow-hidden ${panel} [&>div]:border-t-0`}>
            <CustomizePanel id={`${panelId}-edit`} player={viewer.player} tier={tier} onClose={() => setOpen(null)} onPicture={setPicture} />
          </div>
        )}
        {open === "challenge" && viewer.kind === "player" && <ChallengePanel username={username} />}
        {open === "report" && viewer.kind === "player" && (
          <ReportPanel username={username} matchId={viewer.reportMatchId} onDone={() => setOpen(null)} />
        )}
      </div>
    </>
  );
}

/** The lobby's friend game, started from here: create a code, send it, the match opens when they join. */
function ChallengePanel({ username }: { username: string }) {
  const sb = useRef(createClient()).current;
  const { friendCode, creating, createFriend, copy, copied, inviteLink, error } = useFriendGame(sb);

  return (
    <div className={`${panel} flex flex-col gap-3 px-5 py-5 md:px-6`}>
      {friendCode ? (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-live="polite">
            <p className="font-mono text-[28px] leading-none font-semibold tracking-[0.12em] tabular-nums">
              <span className="sr-only">Your code </span>
              {friendCode.code}
            </p>
            <button type="button" onClick={() => copy("link", inviteLink)} className={quiet}>
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button type="button" onClick={() => copy("code", friendCode.code)} className={quiet}>
              {copied === "code" ? "Code copied" : "Copy code"}
            </button>
          </div>
          <p className="text-[13px] text-text-muted">
            Send @{username} the link or the code. The duel opens here when they join.
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <button type="button" onClick={createFriend} disabled={creating} className={primary}>
            {creating ? "Creating…" : "Create a game"}
          </button>
          <p className="text-[13px] text-text-muted">An unranked duel: 3 questions, 5:00, no rating change.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[14px] font-medium text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Reports go through a duel the two of you played (report_player). Without one in this
 * player's recent duels there's nothing to attach it to yet.
 */
function ReportPanel({ username, matchId, onDone }: { username: string; matchId: string | null; onDone: () => void }) {
  const sb = useRef(createClient()).current;
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  if (!matchId) {
    return (
      <div className={`${panel} flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[14px] md:px-6`}>
        <p className="text-text-muted">You can report @{username} from a duel you&apos;ve played together. None is recent enough to show here.</p>
        <button type="button" onClick={onDone} className={quiet}>
          Close
        </button>
      </div>
    );
  }

  if (state === "sent") {
    return (
      <div className={`${panel} flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[14px] md:px-6`} role="status">
        <p>Thanks. A moderator will look at it.</p>
        <button type="button" onClick={onDone} className={quiet}>
          Close
        </button>
      </div>
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || !matchId) return;
    setState("sending");
    setError(null);
    try {
      await api.reportPlayer(sb, matchId, reason.trim());
      setState("sent");
    } catch (err) {
      setError(friendlyError(err));
      setState("idle");
    }
  }

  return (
    <form onSubmit={send} className={`${panel} flex flex-col gap-3 px-5 py-5 md:px-6`}>
      <label htmlFor={id} className="text-[14px] font-semibold">
        Report @{username}
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="What happened? Cheating, an offensive name or picture…"
        className="w-full rounded-(--radius-md) border border-line bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-text-muted"
      />
      <p className="text-[12px] text-text-muted">Attached to your most recent duel together.</p>
      {error && (
        <p role="alert" className="text-[14px] font-medium text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={!reason.trim() || state === "sending"} className={primary}>
          {state === "sending" ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={onDone} className={quiet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}
