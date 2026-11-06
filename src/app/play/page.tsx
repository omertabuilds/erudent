import { requirePlayer } from "@/lib/session";
import Link from "next/link";
import Lobby from "@/components/Lobby";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const { supabase, profile } = await requirePlayer("/play");
  const { data: rank } = await supabase.rpc("rank_name", { p_elo: profile.elo, p_matches: profile.matches_played });
  const placementLeft = Math.max(0, 10 - profile.matches_played);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-10 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-4xl tracking-tight">erudent</h1>
        <Link href={`/u/${encodeURIComponent(profile.username)}`} className="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline">
          @{profile.username}
        </Link>
      </header>

      <section className="flex flex-col gap-1 border border-line p-5">
        <span className="text-xs uppercase tracking-widest text-muted">Rank</span>
        <span className="font-serif text-3xl">{rank as string}</span>
        <span className="text-sm text-muted">
          {placementLeft > 0
            ? `${placementLeft} placement ${placementLeft === 1 ? "match" : "matches"} left`
            : `${profile.elo} Elo`}
          {" · "}
          {profile.wins}W {profile.losses}L {profile.draws}D
        </span>
      </section>

      <Lobby />
    </main>
  );
}
