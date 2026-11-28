"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { MyPlayer } from "@/lib/erudent";
import { TIER_NAMES } from "@/lib/erudent";
import RankBadge, { type Rank } from "@/components/RankBadge";
import { CustomizePanel } from "@/components/ProfileBanner";

export const PLACEMENT = 10;

const BANNER_FILES = [
  "rank-1-novice",
  "rank-2-apprentice",
  "rank-3-scholar",
  "rank-4-savant",
  "rank-5-sage",
  "rank-6-erudite",
];

type Player = Pick<
  MyPlayer,
  | "id"
  | "username"
  | "elo"
  | "matches_played"
  | "banner"
  | "accent"
  | "tagline"
  | "avatar_path"
  | "avatar_url"
>;

/**
 * The /play banner: the rank's mountain art across the page, faded hard into bg at the
 * bottom and left. Picture, handle and badge on the left; numbers on the right.
 * `tier` is 1–6 once placed, 0 during placement (no ring, no badge, placement progress instead).
 * The pencil opens the customize panel (picture, match-card preset and accent, tagline) under it.
 */
export default function LobbyBanner({
  player,
  tier,
  place,
}: {
  player: Player;
  tier: number;
  place: number | null;
}) {
  const ranked = tier >= 1;
  const rankName = ranked ? TIER_NAMES[tier - 1] : "Unranked";
  const played = Math.min(player.matches_played, PLACEMENT);
  const [editing, setEditing] = useState(false);
  const panelId = useId();

  return (
    <>
      <section
        aria-label={`@${player.username}`}
        className="relative h-[260px] overflow-hidden md:h-[300px]"
      >
        <Image
          src={`/images/banners/${BANNER_FILES[(ranked ? tier : 1) - 1]}.jpg`}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_58%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(11,11,13,0.55)_0%,rgba(11,11,13,0)_22%,rgba(11,11,13,0.35)_52%,rgba(11,11,13,0.85)_78%,var(--bg)_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(11,11,13,0.8)_0%,rgba(11,11,13,0)_40%,rgba(11,11,13,0)_70%,rgba(11,11,13,0.6)_100%)]"
        />

        {/* Settings, left of the pencil and drawn the same way. The header's Settings link is hidden on phones, so this is the way there. */}
        <Link
          href="/settings"
          aria-label="Settings"
          className="group absolute top-[11px] right-[calc(1rem-7px+44px)] z-10 flex size-11 items-center justify-center md:right-[calc(2.5rem-7px+44px)]"
        >
          <span className="flex size-[30px] items-center justify-center rounded-[6px] bg-[rgba(11,11,13,0.45)] text-[#d6d2c9] group-hover:bg-[rgba(11,11,13,0.7)] group-hover:text-text">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </span>
        </Link>

        {/* 30px pencil inside a 44px hit area. */}
        <button
          type="button"
          aria-label="Edit banner"
          aria-expanded={editing}
          aria-controls={panelId}
          onClick={() => setEditing(!editing)}
          className="group absolute top-[11px] right-[calc(1rem-7px)] z-10 flex size-11 cursor-pointer items-center justify-center md:right-[calc(2.5rem-7px)]"
        >
          <span className="flex size-[30px] items-center justify-center rounded-[6px] bg-[rgba(11,11,13,0.45)] text-[#d6d2c9] group-hover:bg-[rgba(11,11,13,0.7)] group-hover:text-text group-aria-expanded:bg-text group-aria-expanded:text-bg">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
        </button>

        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-x-6 gap-y-4 px-4 pb-6 md:px-10">
          <div className="flex min-w-0 items-end gap-4 md:gap-[18px]">
            <Picture
              username={player.username}
              url={player.avatar_url}
              ring={ranked ? `var(--rank-${tier})` : null}
            />
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1
                  className="text-[24px] leading-tight font-semibold tracking-[-0.035em] break-all md:text-[28px]"
                  style={{
                    color: ranked ? `var(--rank-${tier}-text)` : "var(--text)",
                  }}
                >
                  {player.username}
                </h1>
                {ranked ? (
                  <span className="flex items-center gap-1.5">
                    <RankBadge rank={tier as Rank} size={22} decorative />
                    <span
                      className="font-mono text-[11px] tracking-[0.12em] uppercase"
                      style={{ color: `var(--rank-${tier}-text)` }}
                    >
                      {rankName}
                    </span>
                  </span>
                ) : (
                  <span className="font-mono text-[11px] tracking-[0.12em] text-text-muted uppercase">
                    Unranked
                  </span>
                )}
              </div>
            </div>
          </div>

          <dl className="flex flex-wrap gap-x-9 gap-y-3">
            <Stat label="Elo" value={player.elo.toLocaleString("en-US")} />
            {ranked ? (
              <Stat
                label="Global"
                value={
                  place === null ? "—" : `#${place.toLocaleString("en-US")}`
                }
              />
            ) : (
              <Stat label="Placement" value={`${played} / ${PLACEMENT}`} />
            )}
          </dl>
        </div>
      </section>

      {editing && (
        <div className="mx-auto max-w-[1280px] px-4 pt-4 md:px-10">
          <div className="overflow-hidden rounded-(--radius-lg) border border-line bg-surface [&>div]:border-t-0">
            <CustomizePanel
              id={panelId}
              player={player}
              tier={tier}
              onClose={() => setEditing(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[12px] leading-4 text-text-muted">{label}</dt>
      <dd className="font-mono text-[22px] leading-7 font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** Uploaded picture or initial, 84px (64 on phones), with a 2px rank-color ring once ranked. */
function Picture({
  username,
  url,
  ring,
}: {
  username: string;
  url: string | null;
  ring: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex size-16 flex-none items-center justify-center overflow-hidden rounded-full bg-text text-[26px] leading-none font-bold text-bg select-none md:size-[84px] md:text-[34px]"
      style={{
        boxShadow: ring ? `0 0 0 3px var(--bg), 0 0 0 5px ${ring}` : undefined,
      }}
    >
      {url ? (
        // A user-uploaded file on Supabase Storage, already 256×256: next/image would only add a remote config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        username.charAt(0).toUpperCase()
      )}
    </span>
  );
}
