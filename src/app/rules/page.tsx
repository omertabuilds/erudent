import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteHeader, { gutter } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Rules — Erudent",
};

function Rule({ title, first, children }: { title: string; first?: boolean; children: ReactNode }) {
  return (
    <section className={first ? "" : "border-t border-hairline pt-8"}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <SiteHeader />

      <main className={`mx-auto w-full max-w-[760px] flex-[1_0_auto] py-12 sm:py-16 ${gutter}`}>
        <p className="mb-4 text-sm text-ink-muted">Rules</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Three problems. Five minutes.</h1>

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

          <Rule title="Answers">
            <p>
              Numbers only. Whole numbers, or fractions typed like <code>3/4</code>. No decimals. Fractions are simplified for you. One attempt per problem. A wrong answer costs nothing but that problem.
            </p>
            <p>
              A badly formatted answer (like <code>0.5</code>) doesn&apos;t use up your attempt. Negative answers like <code>-3/4</code> work too.
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
