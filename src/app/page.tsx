import type { Metadata } from "next";
import type { ReactNode } from "react";
import EarlyAccess, { type RedeemError } from "@/components/EarlyAccess";
import SiteHeader, { gutter } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Climb from "@/components/landing/Climb";
import Reveal from "@/components/landing/Reveal";
import SmoothScroll from "@/components/landing/SmoothScroll";

export const metadata: Metadata = {
  title: "Erudent — early access",
};

const RANKS = ["Novice", "Apprentice", "Scholar", "Savant", "Sage", "Erudite"];

const STEPS = [
  { n: "1", title: "Three problems", body: "A, B and C, worth 1, 2 and 3 points. Your opponent gets the same three." },
  { n: "2", title: "Five minutes", body: "One try per question. All or nothing." },
  { n: "3", title: "Climb six ranks", body: "Wins move your Elo. Your Elo sets your rank, from Novice to Erudite." },
];

const h2 = "text-[clamp(36px,5vw,56px)] leading-[1] font-extrabold tracking-[-0.03em]";

/** A section on the 1200px grid. The id sits outside Reveal so anchors land on the untransformed box. */
function Section({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <section id={id} className={`mx-auto mt-16 w-full max-w-[1312px] scroll-mt-6 md:mt-32 ${gutter}`}>
      <Reveal>{children}</Reveal>
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ redeem?: string; access?: string }> }) {
  // redeem: set by /redeem/[code] when a code fails after sign-in.
  // access=required: set when /play turns away a player without a redeemed code.
  const { redeem, access } = await searchParams;
  const redeemError: RedeemError | null =
    redeem === "invalid" || redeem === "limited" || redeem === "error" ? redeem : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <SmoothScroll />
      <noscript>
        <style>{`.reveal{opacity:1;transform:none}`}</style>
      </noscript>

      <SiteHeader />

      <main className="flex-[1_0_auto] pb-24 md:pb-32">
        {/* md+: scene, then text. Below md: text first, scene underneath. */}
        <section className="relative flex flex-col overflow-hidden">
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

        <Section id="how-it-works">
          <h2 className={h2}>How it works</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col rounded-(--r-md) border border-hairline bg-surface p-6 md:p-8">
                <span className="text-[13px] leading-none font-semibold text-ink-muted tabular-nums">{s.n}</span>
                <h3 className="mt-8 text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-3 text-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section>
          <h2 className={h2}>Six ranks.</h2>
          <p className="mt-4 max-w-[520px] text-[19px] leading-[29px] text-ink-muted">Problems get harder as you climb.</p>
          <ol className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="Ranks, lowest to highest">
            {RANKS.map((r, i) => {
              const top = i === RANKS.length - 1;
              return (
                <li key={r} className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-11 items-center rounded-(--r-pill) border px-5 text-[16px] ${
                      top ? "border-ink bg-ink font-extrabold text-on-ink" : "border-rule font-semibold text-ink"
                    }`}
                  >
                    {r}
                  </span>
                  {!top && (
                    <span aria-hidden="true" className="text-ink-muted">
                      →
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>

        <Section>
          <h2 className={h2}>Practice.</h2>
          <p className="mt-4 text-[clamp(22px,2.6vw,30px)] leading-[1.3] font-semibold text-ink-muted">Endless, unranked, answers explained.</p>
        </Section>

        <Section>
          <h2 className={`${h2} max-w-[760px]`}>Early access opens by invitation.</h2>
          <EarlyAccess redeemError={null} />
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
