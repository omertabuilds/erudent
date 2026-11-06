import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { api } from "@/lib/erudent";
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

/** Public profile: who they are, where they stand, their last ten duels. Works signed out. */
export default async function ProfilePage({ params }: Props) {
  const name = decodeURIComponent((await params).username);
  const profile = await loadProfile(name);
  if (!profile) notFound();
  if (profile.username !== name) redirect(`/u/${encodeURIComponent(profile.username)}`); // one URL per player

  const matches = await api.recentMatches(await createClient(), profile.username);
  return <ProfileView profile={profile} matches={matches} />;
}
