import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { api, type PublicPlayer, type RecentMatch } from "@/lib/erudent";
import ProfileView from "@/components/ProfileView";

export const dynamic = "force-dynamic";

// Anything that can't be a username skips the database.
const loadProfile = cache(async (name: string) => {
  if (!/^[A-Za-z0-9_.-]{1,20}$/.test(name)) return null;
  return api.profile(await createClient(), name);
});

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile(decodeURIComponent((await params).username));
  return { title: profile ? `@${profile.username} — Erudent` : "Player not found — Erudent" };
}

/** Public profile: who they are, where they stand, their recent duels. Works signed out. */
export default async function ProfilePage({ params }: Props) {
  const name = decodeURIComponent((await params).username);
  const profile = await loadProfile(name);
  if (!profile) notFound();
  if (profile.username !== name) redirect(`/u/${encodeURIComponent(profile.username)}`); // one URL per player

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [matches, place, me] = await Promise.all([
    api.recentMatches(supabase, profile.username).catch(() => [] as RecentMatch[]),
    api.playerPlace(supabase, profile.username).catch(() => null),
    user ? api.myPlayer(supabase).catch(() => null) : Promise.resolve(null),
  ]);

  // Tagline and picture for this player; Elo for each opponent's rank color.
  const opponents = matches.map((m) => m.opponent).filter((o): o is string => o !== null);
  const players = await api.publicPlayers(supabase, [profile.username, ...opponents]).catch(() => [] as PublicPlayer[]);
  const byName = new Map(players.map((p) => [p.username, p]));

  return (
    <ProfileView
      profile={profile}
      details={byName.get(profile.username) ?? null}
      matches={matches}
      opponents={Object.fromEntries(opponents.flatMap((o) => (byName.has(o) ? [[o, byName.get(o)!]] : [])))}
      place={place}
      viewer={me}
      signedIn={!!user}
    />
  );
}
