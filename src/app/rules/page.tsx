import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RankBadge, { type Rank } from "@/components/RankBadge";

export const metadata: Metadata = {
  title: "Rules — Erudent",
};

/** Ranks I–VI and where each starts, as public.tier_for_elo draws them. */
const RANKS = [
  { name: "Novice", range: "under 700" },
  { name: "Apprentice", range: "700 to 899" },
  { name: "Scholar", range: "900 to 1099" },
  { name: "Savant", range: "1100 to 1299" },
  { name: "Sage", range: "1300 to 1499" },
  { name: "Erudite", range: "1500 and up" },
];

const code = "rounded-(--radius-sm) bg-surface-raised px-1.5 py-0.5 font-mono text-[14px] text-text";

/** A mono section label over plain reading text, hairline between sections. */
function Rule({ title, first, id, children }: { title: string; first?: boolean; id?: string; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-6 ${first ? "" : "border-t border-line pt-8"}`}>
      <h2 className="mb-3 font-mono text-[11px] leading-4 font-normal tracking-[0.14em] text-text-muted uppercase">
        {title}
      </h2>
      <div className="space-y-3 text-[17px] leading-[27px] text-[#d6d2c9] [&_li]:marker:text-text-muted">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-[17px] leading-[26px] text-text">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[680px] flex-[1_0_auto] px-4 pt-8 pb-16 md:pt-12 md:pb-24">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-muted">RULES</p>
        <h1 className="mt-1.5 text-[40px] leading-[44px] font-semibold tracking-[-0.045em] text-balance">Three problems. Five minutes.</h1>

        <div className="mt-12 space-y-8">
          <Rule title="The duel" first>
            <p>Both players get the same three problems and five minutes on the server&apos;s clock. Move between them in any order. Most points wins.</p>
          </Rule>

          <Rule title="Recorded runs">
            <p>After 30 seconds in the ranked queue, you may be matched against a recorded run of a real player. It&apos;s rated like a normal duel, but only your rating moves.</p>
          </Rule>

          <Rule title="Points">
            <ul className="list-disc space-y-2 pl-5 tabular-nums lining-nums">
              <li>A: 1 point, one tier below your level</li>
              <li>B: 2 points, at your level</li>
              <li>C: 3 points, one tier above your level</li>
            </ul>
            <p>Maximum 6. All or nothing: a problem is right or it&apos;s worth 0. Your level comes from the average rating of both players.</p>
            <p>Your rank stays hidden until you finish 10 placement matches.</p>
          </Rule>

          <Rule title="Ranks" id="ranks">
            <p>Your Elo sets your rank. Wins move it up, losses move it down.</p>
            <ul className="overflow-hidden rounded-(--radius-lg) border border-line">
              {RANKS.map((r, i) => (
                <li key={r.name} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                  <RankBadge rank={(i + 1) as Rank} size={24} decorative />
                  <span className="font-medium" style={{ color: `var(--rank-${i + 1}-text)` }}>
                    {r.name}
                  </span>
                  <span className="ml-auto font-mono text-[13px] text-text-muted tabular-nums">{r.range}</span>
                </li>
              ))}
            </ul>
            <p>You appear in the rankings after 10 ranked matches.</p>
          </Rule>

          <Rule title="Answers">
            <p>
              Numbers only. Whole numbers, or fractions typed like <code className={code}>3/4</code>. No decimals. Fractions are simplified for you. One attempt per problem. A wrong answer costs nothing but that problem.
            </p>
            <p>
              A badly formatted answer (like <code className={code}>0.5</code>) doesn&apos;t use up your attempt. Negative answers like <code className={code}>-3/4</code> work too.
            </p>
          </Rule>

          <Rule title="Ties">
            <p>Equal points: the player with less total time to their correct answers wins. If both score zero, or the times are equal, it&apos;s a draw.</p>
          </Rule>

          <Rule title="Disconnects">
            <p>Lose your connection for 30 seconds and you forfeit the duel.</p>
          </Rule>

          <Rule title="Focus mode">
            <p>Ranked duels offer fullscreen. Text can&apos;t be copied or selected.</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Leave the tab or window once: a warning.</li>
              <li>Leave again: you forfeit the problem on screen and the duel is flagged for review.</li>
            </ul>
            <p>Duels against a friend don&apos;t use focus mode.</p>
          </Rule>

          <Rule title="Fair play">
            <p>Answers are checked and timed on the server. Solves that are too fast for their tier are flagged.</p>
          </Rule>

          <Rule title="Reports">
            <p>After a duel, report a wrong problem or a suspected cheater from the results screen. Flags and reports are reviewed by the team.</p>
          </Rule>

          <Rule title="Friend duels">
            <p>Duels with a friend (link or code) are unranked. Your rating doesn&apos;t change.</p>
          </Rule>

          <Rule title="Practice">
            <p>Practice is solo and unrated. It never touches your rating.</p>
          </Rule>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
