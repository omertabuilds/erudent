import type { Metadata } from "next";
import Image from "next/image";
import EarlyAccess, { type RedeemError } from "@/components/EarlyAccess";
import Climb from "@/components/landing/Climb";

export const metadata: Metadata = {
  title: "Erudent — early access",
};

const gutter = "px-[clamp(20px,4vw,56px)]";

export default async function Home({ searchParams }: { searchParams: Promise<{ redeem?: string; access?: string }> }) {
  // redeem: set by /redeem/[code] when a code fails after sign-in.
  // access=required: set when /play turns away a player without a redeemed code.
  const { redeem, access } = await searchParams;
  const redeemError: RedeemError | null =
    redeem === "invalid" || redeem === "limited" || redeem === "error" ? redeem : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <header className={`flex items-center gap-3 py-6 ${gutter}`}>
        <Image src="/logos/erudent-mark-small.svg" alt="" width={36} height={36} className="block size-9" />
        <span className="text-[22px] leading-none font-extrabold tracking-[-0.02em]">Erudent</span>
      </header>

      <main className="flex-[1_0_auto]">
        {/* md+: scene, then text. Below md: text first, scene underneath. */}
        <section className="relative flex flex-col overflow-hidden pb-24">
          <div className="order-2 mt-14 md:order-1 md:mt-0">
            <Climb />
          </div>
          <div className="relative order-1 mx-auto flex w-full max-w-[760px] flex-col items-center px-4 pt-10 text-center md:order-2 md:pt-1">
            <h1 className="text-[clamp(52px,8vw,104px)] leading-[.95] font-extrabold tracking-[-0.04em] md:text-[clamp(56px,5.8vw,76px)] md:whitespace-nowrap">
              Math duels.
              <br className="md:hidden" /> Ranked.
            </h1>
            <p className="mt-5 max-w-[460px] text-[19px] leading-[29px] text-ink-muted">
              Same three problems. Five minutes. One opponent. Early access opens by invitation.
            </p>

            <EarlyAccess redeemError={redeemError} needsCode={access === "required"} />
          </div>
        </section>
      </main>

      <footer className={`flex flex-wrap justify-between gap-2 border-t border-hairline py-5 text-[13px] text-ink-muted ${gutter}`}>
        <span>Mathematics arena · opening by invitation</span>
        <span>© 2026 Erudent · Built by Omerta</span>
      </footer>
    </div>
  );
}
