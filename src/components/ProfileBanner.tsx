"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api, BANNERS, friendlyError, TIER_NAMES, type Banner, type MyPlayer, type ProfileStyle } from "@/lib/erudent";
import { AVATAR_TYPES, removeAvatar, uploadAvatar } from "@/lib/avatar";
import { FAR, MID, NEAR, ridge } from "@/components/landing/ridges";
import Avatar from "@/components/Avatar";
import { caption, quiet, secondary } from "@/components/ui";

/**
 * A player's banner: preset art tinted with their accent, then an info strip (picture,
 * @username, rank tag, Elo, W · L · D, tagline). The one bordered surface at the top of /play.
 *
 * Standalone so /u/[username] can use it later: pass `editable` only for the signed-in
 * player's own banner, which adds the Customize panel.
 */

export type BannerPlayer = Pick<
  MyPlayer,
  "id" | "username" | "elo" | "matches_played" | "wins" | "losses" | "draws" | "banner" | "accent" | "tagline" | "avatar_path" | "avatar_url"
>;

const PLACEMENT = 10;

/** Accent 1–6 names, in rank order. Accent 0 = the player's rank hue. */
export const HUE_NAMES = ["Slate", "Teal", "Blue", "Violet", "Green", "Gold"] as const;
const BANNER_NAMES: Record<Banner, string> = { grid: "Graph paper", mountain: "The climb", construction: "Construction", solid: "Solid" };

/** CSS color for a rank hue 1–6, or ink-muted for none (unranked with the rank accent). */
export const hue = (n: number) => (n >= 1 && n <= 6 ? `var(--rank-${n})` : "var(--ink-muted)");
const tint = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, var(--surface))`;

export default function ProfileBanner({ player, rank, editable = false }: { player: BannerPlayer; rank: string; editable?: boolean }) {
  const router = useRouter();
  const sb = useRef(createClient()).current;
  const tier = TIER_NAMES.indexOf(rank as (typeof TIER_NAMES)[number]) + 1; // 0 while unranked

  const [saved, setSaved] = useState<ProfileStyle>({ banner: player.banner, accent: player.accent, tagline: player.tagline });
  const [draft, setDraft] = useState<ProfileStyle>(saved);
  const [picture, setPicture] = useState({ path: player.avatar_path, url: player.avatar_url });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const panelId = useId();

  // While customizing, the banner above previews the draft.
  const shown = open ? draft : saved;
  const accentHue = hue(shown.accent || tier);
  const placementLeft = Math.max(0, PLACEMENT - player.matches_played);

  function close() {
    setDraft(saved);
    setStyleError(null);
    setPictureError(null);
    setOpen(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStyleError(null);
    try {
      const s = await api.updateProfileStyle(sb, draft);
      setSaved(s);
      setDraft(s);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setStyleError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still fires
    if (!file) return;
    setUploading(true);
    setPictureError(null);
    try {
      setPicture(await uploadAvatar(sb, player.id, file, picture.path));
      router.refresh();
    } catch (err) {
      setPictureError(friendlyError(err));
    } finally {
      setUploading(false);
    }
  }

  async function unsetPicture() {
    setUploading(true);
    setPictureError(null);
    try {
      await removeAvatar(sb, picture.path);
      setPicture({ path: null, url: null });
      router.refresh();
    } catch (err) {
      setPictureError(friendlyError(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-label={`@${player.username}`} className="overflow-hidden rounded-(--r-md) border border-hairline bg-surface">
      <div className="h-40 md:h-[200px]" aria-hidden="true">
        <BannerArt banner={shown.banner} color={accentHue} />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-5 pb-5 md:px-8 md:pb-6">
        <div className="flex min-w-0 flex-[1_1_320px] items-start gap-4 md:gap-5">
          {/* Only the picture rides up over the banner's edge; the name sits below it. */}
          <span className="-mt-7 flex md:-mt-9">
            <Picture username={player.username} url={picture.url} />
          </span>
          <div className="min-w-0 pt-3 md:pt-4">
            <p className="text-[22px] leading-[28px] font-extrabold tracking-[-0.01em] break-all md:text-[28px] md:leading-[32px] md:tracking-[-0.02em]">
              @{player.username}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <RankTag rank={rank} tier={tier} />
              <span className="text-[15px] text-ink-muted tabular-nums">
                <span aria-hidden="true">
                  {player.wins}W · {player.losses}L · {player.draws}D
                </span>
                <span className="sr-only">
                  {player.wins} wins, {player.losses} losses, {player.draws} draws
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 max-sm:w-full max-sm:justify-between">
          {placementLeft > 0 ? (
            <p className="text-[17px] font-semibold tabular-nums">
              {placementLeft} placement {placementLeft === 1 ? "duel" : "duels"} left
            </p>
          ) : (
            <p className="flex items-baseline gap-2">
              <span className="text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">{player.elo.toLocaleString("en-US")}</span>
              <span className="text-[15px] font-semibold text-ink-muted">Elo</span>
            </p>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => (open ? close() : setOpen(true))}
              aria-expanded={open}
              aria-controls={panelId}
              className={secondary}
            >
              {open ? "Close" : "Customize"}
            </button>
          )}
        </div>

        {shown.tagline && <p className="w-full text-ink-muted">{shown.tagline}</p>}
      </div>

      {editable && open && (
        <div id={panelId} className="border-t border-hairline px-5 py-6 md:px-8 md:py-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-16">
            <section aria-labelledby={`${panelId}-pic`} className="lg:col-span-4">
              <h3 id={`${panelId}-pic`} className="font-semibold">
                Profile picture
              </h3>
              <div className="mt-4 flex items-center gap-4">
                <Picture username={player.username} url={picture.url} size={64} ring={false} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label
                    className={`${secondary} cursor-pointer has-[:disabled]:cursor-default has-[:disabled]:opacity-40 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus`}
                  >
                    {uploading ? "Uploading…" : picture.url ? "Replace" : "Upload"}
                    <input type="file" accept={AVATAR_TYPES.join(",")} onChange={pick} disabled={uploading} className="sr-only" />
                  </label>
                  {picture.url && (
                    <button type="button" onClick={unsetPicture} disabled={uploading} className={`${quiet} disabled:opacity-40`}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className={`${caption} mt-3`}>JPEG, PNG or WebP. Cropped to a square. Saves as soon as it uploads.</p>
              {pictureError && (
                <p role="alert" className="mt-2 text-[15px] leading-[22px]">
                  {pictureError}
                </p>
              )}
            </section>

            <form onSubmit={save} className="flex flex-col gap-8 lg:col-span-8">
              <fieldset>
                <legend className="font-semibold">Banner</legend>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {BANNERS.map((b) => (
                    <label key={b} className="group flex cursor-pointer flex-col gap-2">
                      <input
                        type="radio"
                        name={`${panelId}-banner`}
                        value={b}
                        checked={draft.banner === b}
                        onChange={() => setDraft({ ...draft, banner: b })}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="block h-14 overflow-hidden rounded-(--r-sm) border border-hairline peer-checked:border-ink peer-checked:outline-1 peer-checked:outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                      >
                        <BannerArt banner={b} color={accentHue} />
                      </span>
                      <span className="text-[15px] text-ink-muted peer-checked:font-semibold peer-checked:text-ink">{BANNER_NAMES[b]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-semibold">Accent</legend>
                <div className="mt-4 flex flex-wrap gap-x-2 gap-y-2">
                  {[0, 1, 2, 3, 4, 5, 6].map((a) => (
                    <label key={a} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`${panelId}-accent`}
                        value={a}
                        checked={draft.accent === a}
                        onChange={() => setDraft({ ...draft, accent: a })}
                        className="peer sr-only"
                      />
                      <span className="inline-flex h-11 items-center gap-2 rounded-(--r-pill) border border-hairline pr-4 pl-2 text-[15px] text-ink-muted peer-checked:border-ink peer-checked:font-semibold peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                        <span aria-hidden="true" className="size-6 rounded-full" style={{ background: hue(a || tier) }} />
                        {a === 0 ? "Rank" : HUE_NAMES[a - 1]}
                      </span>
                    </label>
                  ))}
                </div>
                <p className={`${caption} mt-3`}>Rank follows your rank&apos;s hue as you climb.</p>
              </fieldset>

              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <label htmlFor={`${panelId}-tagline`} className="font-semibold">
                    Tagline
                  </label>
                  <span className={`${caption} tabular-nums`} aria-live="polite">
                    {(draft.tagline ?? "").length}/60
                  </span>
                </div>
                <input
                  id={`${panelId}-tagline`}
                  value={draft.tagline ?? ""}
                  onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="One line about you"
                  className="mt-3 h-11 w-full rounded-(--r-md) border border-hairline bg-sunken px-4 text-ink placeholder:text-ink-muted"
                />
              </div>

              {styleError && (
                <p role="alert" className="text-[15px] leading-[22px]">
                  {styleError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <button disabled={saving} className={`${secondary} disabled:opacity-40`}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={close} className={quiet}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

/** Uploaded picture (round, cover) or the initial. 72px on md+, 56px on phones, edged in surface over the banner. */
function Picture({ username, url, size, ring = true }: { username: string; url: string | null; size?: number; ring?: boolean }) {
  const edge = ring ? "rounded-full border-4 border-surface bg-surface" : "";
  const img = (px: number) =>
    url ? (
      // A user-uploaded file on Supabase Storage, already 256×256: next/image would only add a remote config.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={px} height={px} className="block rounded-full object-cover" style={{ width: px, height: px }} />
    ) : (
      <Avatar username={username} size={px} />
    );
  if (size) return <span className={`flex flex-none ${edge}`}>{img(size)}</span>;
  return (
    <span className={`flex flex-none ${edge}`}>
      <span className="flex md:hidden">{img(56)}</span>
      <span className="hidden md:flex">{img(72)}</span>
    </span>
  );
}

/** The rank in its hue: pill, hairline border, no fill. Unranked is ink-muted. */
export function RankTag({ rank, tier }: { rank: string; tier: number }) {
  return (
    <span
      className="inline-flex h-7 items-center rounded-(--r-pill) border border-hairline px-3 text-[13px] font-semibold"
      style={{ color: tier ? hue(tier) : "var(--ink-muted)" }}
    >
      {rank}
    </span>
  );
}

// ── Banner art ──────────────────────────────────────────────────────
// Inline SVG in a 1200×200 box, sliced to fill. Paper/surface from tokens, tinted with `color`.

const W = 1200;
const H = 200;

// Construction: a triangle with its three angle bisectors meeting at the incenter, the incircle,
// and compass arcs. Kept to the right, where a phone's slice of the banner still shows it.
const TRI = { A: [800, 182] as const, B: [1140, 182] as const, C: [930, 30] as const };
const dist = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const CONSTRUCTION = (() => {
  const { A, B, C } = TRI;
  const a = dist(B, C);
  const b = dist(C, A);
  const c = dist(A, B);
  const s = a + b + c;
  const I = [(a * A[0] + b * B[0] + c * C[0]) / s, (a * A[1] + b * B[1] + c * C[1]) / s];
  const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
  // Each bisector runs from a vertex to the opposite side, splitting it in the ratio of the adjacent sides.
  const foot = (P: readonly number[], Q: readonly number[], R: readonly number[]) => {
    const t = dist(P, Q) / (dist(P, Q) + dist(P, R));
    return [Q[0] + (R[0] - Q[0]) * t, Q[1] + (R[1] - Q[1]) * t];
  };
  return {
    I,
    r: (2 * area) / s,
    bisectors: [
      [A, foot(A, B, C)],
      [B, foot(B, C, A)],
      [C, foot(C, A, B)],
    ],
  };
})();

const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
  const p = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

export function BannerArt({ banner, color }: { banner: Banner; color: string }) {
  const id = useId().replace(/:/g, "");
  const stroke: CSSProperties = { stroke: color, fill: "none", vectorEffect: "non-scaling-stroke" };
  const bg = tint(color, banner === "solid" ? 16 : 7);

  if (banner === "mountain") {
    return (
      <svg viewBox="-1200 -20 2400 460" preserveAspectRatio="xMidYMax slice" className="block size-full" style={{ background: tint(color, 5) }}>
        <path d={ridge(FAR)} style={{ fill: tint(color, 10) }} />
        <path d={ridge(MID)} style={{ fill: tint(color, 18) }} />
        {[140, 210, 290].map((y) => (
          <line key={y} x1={-900} x2={900} y1={y} y2={y} strokeDasharray="3 5" opacity="0.45" style={stroke} />
        ))}
        <path d={ridge(NEAR)} strokeWidth="1" style={{ fill: "var(--surface)", stroke: "var(--hairline)", vectorEffect: "non-scaling-stroke" }} />
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={banner === "construction" ? "xMaxYMid slice" : "xMidYMid slice"}
      className="block size-full"
      style={{ background: bg }}
    >
      {banner === "grid" && (
        <>
          <defs>
            <pattern id={`${id}-minor`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" strokeWidth="1" opacity="0.22" style={stroke} />
            </pattern>
            <pattern id={`${id}-major`} width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill={`url(#${id}-minor)`} />
              <path d="M 100 0 L 0 0 0 100" strokeWidth="1" opacity="0.45" style={stroke} />
            </pattern>
          </defs>
          <rect width={W} height={H} fill={`url(#${id}-major)`} />
        </>
      )}

      {banner === "construction" && (
        <g strokeWidth="1">
          {/* Compass arcs from the left: the construction that leads to the figure. */}
          <path d={arc(160, 250, 170, 250, 340)} opacity="0.35" style={stroke} />
          <path d={arc(160, 250, 270, 255, 330)} opacity="0.25" style={stroke} />
          <path d={arc(520, 260, 210, 200, 300)} opacity="0.3" style={stroke} strokeDasharray="4 6" />
          {/* Arcs from A and B crossing above the base: its perpendicular bisector. */}
          <path d={arc(TRI.A[0], TRI.A[1], 230, 270, 330)} opacity="0.35" style={stroke} />
          <path d={arc(TRI.B[0], TRI.B[1], 230, 210, 270)} opacity="0.35" style={stroke} />
          <line x1={(TRI.A[0] + TRI.B[0]) / 2} x2={(TRI.A[0] + TRI.B[0]) / 2} y1="0" y2={H} opacity="0.25" strokeDasharray="3 5" style={stroke} />
          <polygon points={`${TRI.A} ${TRI.B} ${TRI.C}`} opacity="0.7" style={stroke} />
          {CONSTRUCTION.bisectors.map(([p, q], i) => (
            <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} opacity="0.5" style={stroke} />
          ))}
          <circle cx={CONSTRUCTION.I[0]} cy={CONSTRUCTION.I[1]} r={CONSTRUCTION.r} opacity="0.5" style={stroke} />
          <circle cx={CONSTRUCTION.I[0]} cy={CONSTRUCTION.I[1]} r="3" style={{ fill: color }} />
        </g>
      )}
    </svg>
  );
}
