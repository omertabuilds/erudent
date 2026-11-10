import type { Metadata } from "next";
import { requirePlayer } from "@/lib/session";
import { SiteHeaderView, gutter } from "@/components/SiteHeader";
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
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <SiteHeaderView state="player" />

      <main className={`mx-auto w-full max-w-[1312px] flex-[1_0_auto] pt-10 pb-24 md:pt-16 md:pb-32 ${gutter}`}>
        <p className="text-[13px] leading-none font-semibold tracking-[0.08em] text-ink-muted uppercase">Practice</p>
        <h1 className="mt-4 text-[clamp(36px,5vw,56px)] leading-[1] font-extrabold tracking-[-0.03em]">Endless problems.</h1>
        <p className="mt-4 max-w-[640px] text-[19px] leading-[29px] text-ink-muted">
          Unranked, with no clock. Every answer comes with its proof. Your Elo doesn&apos;t move.
        </p>

        <div className="mt-10 md:mt-16">
          <PracticeRoom />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
