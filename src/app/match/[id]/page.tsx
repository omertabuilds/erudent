import { requirePlayer } from "@/lib/session";
import MatchRoom from "@/components/MatchRoom";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlayer(`/match/${id}`);
  return <MatchRoom matchId={id} />;
}
