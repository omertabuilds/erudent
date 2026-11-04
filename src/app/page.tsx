const ranks = ["Novice", "Apprentice", "Scholar", "Savant", "Sage", "Erudite"];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-6xl tracking-tight">erudent</h1>
        <p className="max-w-md text-lg text-muted">
          Ranked 1v1 math duels. Three questions, five minutes. Climb from
          Novice to Erudite.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Ranks">
        {ranks.map((rank, i) => (
          <li
            key={rank}
            className={
              i === ranks.length - 1
                ? "border border-foreground bg-foreground px-3 py-1 text-sm text-background"
                : "border border-foreground px-3 py-1 text-sm"
            }
          >
            {rank}
          </li>
        ))}
      </ol>

      <p className="text-sm text-muted">Coming December 13, 2026. Built by omertà.</p>
    </main>
  );
}
