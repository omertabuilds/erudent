import type { Metadata } from "next";
import { requirePlayer } from "@/lib/session";
import { SiteHeaderView } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import MatchRoom from "@/components/MatchRoom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Duel — Erudent",
};

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlayer(`/match/${id}`);
  // MatchRoom shows the header and footer only while loading or waiting for a friend; the duel has its own top bar.
  // A duel is part of Play: its link reads as current (and drops the button look, which keeps the header inside 390px).
  return <MatchRoom matchId={id} header={<SiteHeaderView state="player" current="play" />} footer={<SiteFooter />} />;
}
