import type { Metadata } from "next";
import { requirePlayer } from "@/lib/session";
import { SiteHeaderView } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PracticeRoom from "@/components/PracticeRoom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Practice — Erudent",
};

export default async function PracticePage() {
  // Redirects anyone without a redeemed code, so the header is always the player's.
  await requirePlayer("/practice");

  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
      <SiteHeaderView state="player" />

      <main className="mx-auto w-full max-w-[1240px] flex-[1_0_auto] px-4 pt-8 pb-14 md:px-10">
        <PracticeRoom />
      </main>

      <SiteFooter />
    </div>
  );
}
