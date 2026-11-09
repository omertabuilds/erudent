
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Rules — Erudent",
};

export default function RulesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper font-ui text-[17px] leading-[26px] text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-hairline py-5 px-[clamp(16px,4vw,56px)]">
        <Link href="/" className="flex min-h-11 items-center gap-3">
          <Image
            src="/logos/erudent-mark-small.svg"
            alt=""
            width={36}
            height={36}
            className="block size-9"
          />
          <span className="text-[22px] leading-none font-extrabold tracking-[-0.02em]">
            Erudent
          </span>
        </Link>
        <Link
          href="/play"
          className="inline-flex min-h-11 items-center text-[15px] font-semibold underline-offset-4 hover:underline"
        >
          Play
        </Link>
      </header>

      <main className="w-full max-w-[760px] px-[clamp(16px,4vw,56px)] py-12 sm:py-16">
        <p className="mb-4 text-sm text-ink-muted">
          Rules
        </p>

        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Three problems. Five minutes.
        </h1>

        <div className="mt-12 space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              The duel
            </h2>
            <p className="leading-relaxed text-ink-muted">
              Both players get the same three problems and five minutes on the server&apos;s clock. Move between them in any order. Most points wins.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Points
            </h2>
            <ul className="mb-4 list-disc space-y-2 pl-5 tabular-nums lining-nums text-ink-muted">
              <li>A: 1 point, one tier below your level</li>
              <li>B: 2 points, at your level</li>
              <li>C: 3 points, one tier above your level</li>
            </ul>
            <p className="leading-relaxed text-ink-muted">
              Maximum 6. All or nothing: a problem is right or it&apos;s worth 0. Your level comes from the average rating of both players.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Answers
            </h2>
            <p className="leading-relaxed text-ink-muted">
              Numbers only. Whole numbers, or fractions typed like{" "}
              <code>3/4</code>. No decimals. Fractions are simplified for you. One attempt per problem. A wrong answer costs nothing but that problem.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Ties
            </h2>
            <p className="leading-relaxed text-ink-muted">
              Equal points: the player with less total time to their correct answers wins. If both score zero, or the times are equal, it&apos;s a draw.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Disconnects
            </h2>
            <p className="leading-relaxed text-ink-muted">
              Lose your connection for 30 seconds and you forfeit the duel.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Focus mode
            </h2>
            <p className="mb-4 leading-relaxed text-ink-muted">
              Ranked duels open in fullscreen. Text can&apos;t be copied or selected.
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-5 text-ink-muted">
              <li>Leave the tab once: a warning.</li>
              <li>Leave again: you forfeit the problem on screen and the duel is flagged for review.</li>
            </ul>
            <p className="leading-relaxed text-ink-muted">
              Duels against a friend don&apos;t use focus mode.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Fair play
            </h2>
            <p className="leading-relaxed text-ink-muted">
              Answers are checked and timed on the server. Solves that are too fast for their tier are flagged, and a member of the team reviews every flag.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Reports
            </h2>
            <p className="leading-relaxed text-ink-muted">
              After a duel, report a wrong problem or a suspected cheater from the results screen. A person reads every report.
            </p>
          </section>

          <section className="border-t border-hairline pt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Friend duels
            </h2>
            <p className="leading-relaxed text-ink-muted">
              Duels from an invite link are unranked. Your rating doesn&apos;t change.
            </p>
          </section>
        </div>

        <p className="mt-8 border-t border-hairline pt-8 text-ink-muted">
          How your rating moves is on{" "}
          <Link href="/elo" className="text-ink underline">
            How Elo works
          </Link>. ∎
        </p>
      </main>

      <footer className="flex flex-wrap justify-between gap-2 border-t border-hairline py-5 text-[13px] text-ink-muted px-[clamp(20px,4vw,56px)]">
        <span>Mathematics arena · opening by invitation</span>
        <span>© 2026 Erudent · Built by Omerta</span>
      </footer>
    </div>
  );
}
