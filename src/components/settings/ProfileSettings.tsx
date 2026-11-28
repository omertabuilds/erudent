"use client";

import { useId, useState } from "react";
import { CustomizePanel, Picture } from "@/components/ProfileBanner";
import type { MyPlayer } from "@/lib/erudent";
import { caption, secondary } from "@/components/ui";

/**
 * Who you are on the site, with a button that opens the same customize panel as /play and /u
 * (picture, banner, accent, tagline). Nothing is rebuilt here: the panel does its own saving.
 */
export default function ProfileSettings({ player, tier }: { player: MyPlayer; tier: number }) {
  const [open, setOpen] = useState(false);
  const [picture, setPicture] = useState(player.avatar_url);
  const panelId = useId();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Picture username={player.username} url={picture} size={56} ring={false} />
          <div className="min-w-0">
            <p className="truncate font-semibold">@{player.username}</p>
            <p className={`${caption} truncate`}>{player.tagline || "No tagline yet"}</p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId} className={`${secondary} cursor-pointer`}>
          {open ? "Close editor" : "Edit profile"}
        </button>
      </div>

      <div id={panelId}>
        {open && (
          <div className="mt-6 overflow-hidden rounded-(--radius-lg) border border-hairline bg-surface [&>div]:border-t-0">
            <CustomizePanel id={`${panelId}-edit`} player={player} tier={tier} onClose={() => setOpen(false)} onPicture={setPicture} />
          </div>
        )}
      </div>
    </>
  );
}
