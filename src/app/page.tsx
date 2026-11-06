import type { Metadata } from "next";
import Image from "next/image";
import EarlyAccess, { type RedeemError } from "@/components/EarlyAccess";

export const metadata: Metadata = {
  title: "Erudent — early access",
};

const gutter = "px-[clamp(20px,4vw,56px)]";

export default async function Home({ searchParams }: { searchParams: Promise<{ redeem?: string }> }) {
  // Set by /redeem/[code] when a code fails after sign-in.
  const { redeem } = await searchParams;
  const redeemError: RedeemError | null =
    redeem === "invalid" || redeem === "limited" || redeem === "error" ? redeem : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <header className={`flex items-center gap-3 py-6 ${gutter}`}>
        <Image src="/logos/erudent-mark-small.svg" alt="" width={36} height={36} className="block size-9" />
        <span className="text-[22px] leading-none font-extrabold tracking-[-0.02em]">Erudent</span>
      </header>

      <main className={`flex flex-[1_0_auto] items-center pt-6 pb-14 ${gutter}`}>
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-16 gap-y-12">
          <div className="max-w-[620px] min-w-0 flex-[1_1_520px]">
            <h1 className="text-[clamp(52px,8vw,104px)] leading-[.95] font-extrabold tracking-[-0.04em]">
              Math duels.
              <br />
              Ranked.
            </h1>
            <p className="mt-6 max-w-[460px] text-[19px] leading-[29px] text-ink-muted">
              Same three problems. Five minutes. One opponent. Early access opens by invitation.
            </p>

            <EarlyAccess redeemError={redeemError} />
          </div>

          <Image
            src="/logos/erudent-mark.svg"
            alt=""
            width={420}
            height={420}
            priority
            className="block h-auto w-[min(100%,420px)] flex-[0_1_420px]"
          />
        </div>
      </main>

      <footer className={`flex flex-wrap justify-between gap-2 border-t border-hairline py-5 text-[13px] text-ink-muted ${gutter}`}>
        <span>Mathematics arena · opening by invitation</span>
        <span>© 2026 Erudent · Built by Omerta</span>
      </footer>
    </div>
  );
}
